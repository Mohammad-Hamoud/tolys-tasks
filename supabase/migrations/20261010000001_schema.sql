-- Toly's Tasks — core schema, RLS and RPCs.
-- Every permission rule lives here. The client UI only mirrors it.

create extension if not exists pg_net;
create extension if not exists pg_cron;

-- ---------------------------------------------------------------------------
-- Private schema: never exposed through the Data API.
-- ---------------------------------------------------------------------------
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- Key/value config: notify_url, webhook_secret, vapid_public, vapid_private.
create table private.config (
  key   text primary key,
  value text not null
);

-- Only these emails may ever exist in auth.users (sign-ups are blocked).
create table private.allowed_emails (
  email text primary key check (email = lower(email))
);

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete restrict,
  display_name text not null,
  role         text not null check (role in ('admin', 'member')),
  created_at   timestamptz not null default now()
);
-- Exactly one admin (Mohammad).
create unique index profiles_single_admin on public.profiles (role) where role = 'admin';

create type public.task_status as enum ('open', 'pending', 'done');

create table public.tasks (
  id              bigint generated always as identity primary key,
  title           text not null check (char_length(btrim(title)) between 1 and 200),
  created_by      uuid not null references public.profiles (id),
  assignee        uuid not null references public.profiles (id),
  requested_at    date not null,
  created_at      timestamptz not null default now(),
  status          public.task_status not null default 'open',
  done_claimed_at timestamptz,
  completed_at    timestamptz,
  closed_by       uuid references public.profiles (id),
  archived_at     timestamptz,
  archived_by     uuid references public.profiles (id),
  archive_reason  text check (archive_reason is null or char_length(archive_reason) <= 300),
  check (assignee <> created_by),
  check (
       (status = 'open'    and done_claimed_at is null     and completed_at is null)
    or (status = 'pending' and done_claimed_at is not null and completed_at is null)
    or (status = 'done'    and completed_at is not null    and closed_by is not null)
  ),
  check ((archived_at is null) = (archived_by is null))
);
create index tasks_assignee_status on public.tasks (assignee, status) where archived_at is null;

-- Append-only audit log of every state change.
create table public.task_events (
  id         bigint generated always as identity primary key,
  task_id    bigint not null references public.tasks (id),
  actor      uuid not null references public.profiles (id),
  kind       text not null check (kind in ('created', 'claimed', 'closed', 'rejected', 'archived', 'restored')),
  days       integer not null,
  note       text,
  created_at timestamptz not null default now()
);
create index task_events_task on public.task_events (task_id);

create table public.push_subscriptions (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles (id),
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.riyadh_today()
returns date
language sql stable
set search_path = ''
as $$ select (now() at time zone 'Asia/Riyadh')::date $$;

-- Days from the request date until the completion moment (or now).
-- A pending task freezes at the "سوّيتها" moment. A rejection clears it, so counting resumes.
create or replace function public.task_days(t public.tasks)
returns integer
language sql stable
set search_path = ''
as $$
  select greatest(0,
    ((coalesce(t.completed_at, t.done_claimed_at, now()) at time zone 'Asia/Riyadh')::date - t.requested_at)
  )::integer
$$;

create or replace function private.is_participant()
returns boolean
language sql stable security definer
set search_path = ''
as $$ select exists (select 1 from public.profiles where id = auth.uid()) $$;

create or replace function private.is_admin()
returns boolean
language sql stable security definer
set search_path = ''
as $$ select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') $$;

grant usage on schema private to authenticated;
revoke all on all functions in schema private from public, anon;
grant execute on function private.is_participant(), private.is_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- Privileges + RLS: read-only for the two participants, all writes via RPCs.
-- ---------------------------------------------------------------------------
revoke all on public.profiles, public.tasks, public.task_events, public.push_subscriptions from anon, authenticated;
grant select on public.profiles, public.tasks, public.task_events to authenticated;
grant select on public.push_subscriptions to authenticated;

alter table public.profiles           enable row level security;
alter table public.tasks              enable row level security;
alter table public.task_events        enable row level security;
alter table public.push_subscriptions enable row level security;

create policy profiles_read on public.profiles for select to authenticated
  using ((select private.is_participant()));
create policy tasks_read on public.tasks for select to authenticated
  using ((select private.is_participant()));
create policy events_read on public.task_events for select to authenticated
  using ((select private.is_participant()));
create policy push_read_own on public.push_subscriptions for select to authenticated
  using (user_id = (select auth.uid()));

-- Belt and braces: the audit log can never be edited or removed, even by mistake.
create or replace function private.forbid_change()
returns trigger
language plpgsql
set search_path = ''
as $$ begin raise exception 'immutable: % on % is not allowed', tg_op, tg_table_name; end $$;

create trigger task_events_immutable before update or delete on public.task_events
  for each row execute function private.forbid_change();
create trigger tasks_no_delete before delete on public.tasks
  for each row execute function private.forbid_change();

-- requested_at and the people on a task can never change after insert.
create or replace function private.freeze_task_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.requested_at <> old.requested_at or new.created_by <> old.created_by
     or new.assignee <> old.assignee or new.created_at <> old.created_at then
    raise exception 'requested_at / created_by / assignee are immutable';
  end if;
  return new;
end $$;
create trigger tasks_freeze before update on public.tasks
  for each row execute function private.freeze_task_fields();

-- ---------------------------------------------------------------------------
-- RPCs (SECURITY DEFINER): the only way to change data.
-- ---------------------------------------------------------------------------
create or replace function private.deny(msg text)
returns void
language plpgsql
set search_path = ''
as $$ begin raise exception '%', msg using errcode = '42501'; end $$;

create or replace function private.log_event(p_task public.tasks, p_kind text, p_note text default null)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.task_events (task_id, actor, kind, days, note)
  values (p_task.id, auth.uid(), p_kind, public.task_days(p_task), nullif(btrim(p_note), ''));
$$;

-- Both users: add a task. The assignee is always the *other* person.
create or replace function public.add_task(p_title text, p_requested_at date default null)
returns public.tasks
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me    uuid := auth.uid();
  v_other uuid;
  v_today date := public.riyadh_today();
  v_date  date := coalesce(p_requested_at, v_today);
  r       public.tasks;
begin
  if not private.is_participant() then perform private.deny('غير مصرّح'); end if;
  if p_title is null or char_length(btrim(p_title)) = 0 then
    raise exception 'العنوان مطلوب' using errcode = '22023';
  end if;
  if v_date > v_today then
    raise exception 'تاريخ الطلب لا يمكن أن يكون في المستقبل' using errcode = '22023';
  end if;
  if v_date < v_today - 365 then
    raise exception 'تاريخ الطلب أقدم من سنة' using errcode = '22023';
  end if;

  select id into v_other from public.profiles where id <> v_me limit 1;
  if v_other is null then perform private.deny('لا يوجد طرف آخر'); end if;

  insert into public.tasks (title, created_by, assignee, requested_at)
  values (btrim(p_title), v_me, v_other, v_date)
  returning * into r;

  perform private.log_event(r, 'created');
  return r;
end $$;

-- Wife only: "سوّيتها ✋" on her own open task → pending confirmation.
create or replace function public.claim_done(p_task_id bigint)
returns public.tasks
language plpgsql
security definer
set search_path = ''
as $$
declare r public.tasks;
begin
  if not private.is_participant() or private.is_admin() then
    perform private.deny('هذا الزر لبندور فقط');
  end if;
  select * into r from public.tasks where id = p_task_id for update;
  if not found or r.archived_at is not null then perform private.deny('المهمة غير موجودة'); end if;
  if r.assignee <> auth.uid() then perform private.deny('ليست مهمتك'); end if;
  if r.status <> 'open' then perform private.deny('المهمة ليست مفتوحة'); end if;

  update public.tasks set status = 'pending', done_claimed_at = now()
  where id = p_task_id returning * into r;
  perform private.log_event(r, 'claimed');
  return r;
end $$;

-- Mohammad only: close ("تم ✔️"). Approving a pending task keeps the claim moment as completion.
create or replace function public.close_task(p_task_id bigint)
returns public.tasks
language plpgsql
security definer
set search_path = ''
as $$
declare r public.tasks;
begin
  if not private.is_admin() then perform private.deny('الإغلاق لمحمد فقط'); end if;
  select * into r from public.tasks where id = p_task_id for update;
  if not found or r.archived_at is not null then perform private.deny('المهمة غير موجودة'); end if;
  if r.status = 'done' then perform private.deny('المهمة مغلقة أصلاً'); end if;

  update public.tasks
     set status = 'done',
         completed_at = coalesce(done_claimed_at, now()),
         closed_by = auth.uid()
   where id = p_task_id
  returning * into r;
  perform private.log_event(r, 'closed');
  return r;
end $$;

-- Mohammad only: reject a completion request. The claim time is cleared and counting resumes.
create or replace function public.reject_done(p_task_id bigint, p_note text default null)
returns public.tasks
language plpgsql
security definer
set search_path = ''
as $$
declare r public.tasks;
begin
  if not private.is_admin() then perform private.deny('الرفض لمحمد فقط'); end if;
  select * into r from public.tasks where id = p_task_id for update;
  if not found or r.archived_at is not null then perform private.deny('المهمة غير موجودة'); end if;
  if r.status <> 'pending' then perform private.deny('لا يوجد طلب إنجاز لرفضه'); end if;

  update public.tasks set status = 'open', done_claimed_at = null
  where id = p_task_id returning * into r;
  perform private.log_event(r, 'rejected', p_note);
  return r;
end $$;

-- Mohammad only: soft delete (archive). Nothing is ever hard-deleted.
create or replace function public.archive_task(p_task_id bigint, p_reason text default null)
returns public.tasks
language plpgsql
security definer
set search_path = ''
as $$
declare r public.tasks;
begin
  if not private.is_admin() then perform private.deny('الحذف لمحمد فقط'); end if;
  select * into r from public.tasks where id = p_task_id for update;
  if not found then perform private.deny('المهمة غير موجودة'); end if;
  if r.archived_at is not null then perform private.deny('المهمة مؤرشفة أصلاً'); end if;

  update public.tasks
     set archived_at = now(), archived_by = auth.uid(), archive_reason = nullif(btrim(p_reason), '')
   where id = p_task_id
  returning * into r;
  perform private.log_event(r, 'archived', p_reason);
  return r;
end $$;

-- Mohammad only: restore from the archive.
create or replace function public.restore_task(p_task_id bigint)
returns public.tasks
language plpgsql
security definer
set search_path = ''
as $$
declare r public.tasks;
begin
  if not private.is_admin() then perform private.deny('الاسترجاع لمحمد فقط'); end if;
  select * into r from public.tasks where id = p_task_id for update;
  if not found or r.archived_at is null then perform private.deny('المهمة ليست في الأرشيف'); end if;

  update public.tasks set archived_at = null, archived_by = null, archive_reason = null
  where id = p_task_id returning * into r;
  perform private.log_event(r, 'restored');
  return r;
end $$;

-- Push subscriptions: each user manages only their own.
create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_participant() then perform private.deny('غير مصرّح'); end if;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, left(p_user_agent, 300))
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
        user_agent = excluded.user_agent, created_at = now();
end $$;

create or replace function public.delete_push_subscription(p_endpoint text)
returns void
language sql
security definer
set search_path = ''
as $$ delete from public.push_subscriptions where endpoint = p_endpoint and user_id = auth.uid(); $$;

-- Lock down function execution: only signed-in users, never anon.
revoke execute on function
  public.add_task(text, date), public.claim_done(bigint), public.close_task(bigint),
  public.reject_done(bigint, text), public.archive_task(bigint, text), public.restore_task(bigint),
  public.save_push_subscription(text, text, text, text), public.delete_push_subscription(text)
  from public, anon;
grant execute on function
  public.add_task(text, date), public.claim_done(bigint), public.close_task(bigint),
  public.reject_done(bigint, text), public.archive_task(bigint, text), public.restore_task(bigint),
  public.save_push_subscription(text, text, text, text), public.delete_push_subscription(text)
  to authenticated;
revoke execute on function private.log_event(public.tasks, text, text), private.deny(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Block sign-ups at the database level: only allow-listed emails can exist.
-- ---------------------------------------------------------------------------
create or replace function private.block_signups()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from private.allowed_emails where email = lower(new.email)) then
    raise exception 'Sign-ups are disabled';
  end if;
  return new;
end $$;
grant usage on schema private to supabase_auth_admin;
grant execute on function private.block_signups() to supabase_auth_admin;
create trigger block_signups before insert on auth.users
  for each row execute function private.block_signups();

-- ---------------------------------------------------------------------------
-- Notifications: task events → Edge Function "notify" (via pg_net), plus schedules.
-- ---------------------------------------------------------------------------
create or replace function private.fire_notify(p_body jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url    text := (select value from private.config where key = 'notify_url');
  v_secret text := (select value from private.config where key = 'webhook_secret');
begin
  if v_url is null or v_secret is null then return; end if;
  perform net.http_post(
    url     := v_url,
    body    := p_body,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', v_secret),
    timeout_milliseconds := 10000
  );
end $$;
revoke execute on function private.fire_notify(jsonb) from public, anon, authenticated;

create or replace function private.on_task_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.kind in ('created', 'claimed', 'closed', 'rejected') then
    perform private.fire_notify(jsonb_build_object('type', 'event', 'event_id', new.id));
  end if;
  return new;
end $$;
create trigger task_events_notify after insert on public.task_events
  for each row execute function private.on_task_event();

-- Lets the Edge Function (service_role only) read the push config.
create or replace function public.get_service_config()
returns jsonb
language sql
security definer
set search_path = ''
as $$ select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from private.config $$;
revoke execute on function public.get_service_config() from public, anon, authenticated;
grant execute on function public.get_service_config() to service_role;

-- Daily reminder 09:00 Riyadh (06:00 UTC). Friday report 18:00 Riyadh (15:00 UTC).
select cron.schedule('tolys-daily-reminder', '0 6 * * *',
  $$ select private.fire_notify('{"type":"daily"}'::jsonb) $$);
select cron.schedule('tolys-friday-report', '0 15 * * 5',
  $$ select private.fire_notify('{"type":"weekly"}'::jsonb) $$);

-- Live updates in the app.
alter publication supabase_realtime add table public.tasks;
