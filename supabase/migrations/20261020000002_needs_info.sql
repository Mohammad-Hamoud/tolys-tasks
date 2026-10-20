-- "طلب معلومات إضافية" (request more info).
--
-- The assignee of an open task can bounce it back to whoever asked for it, with a question.
--   * status → 'needs_info'. The ball is now with the requester (created_by), and the day counter
--     runs against them, starting from the moment the question was asked.
--   * The assignee is not charged for the wait.
--   * When the requester answers, the task returns to the assignee and their counter starts
--     again from zero (clock_started_at = today). The original requested_at never changes.

alter table public.tasks
  add column clock_started_at  date,
  add column info_requested_at timestamptz,
  add column info_question     text check (info_question is null or char_length(info_question) <= 500);

update public.tasks set clock_started_at = requested_at where clock_started_at is null;
alter table public.tasks alter column clock_started_at set not null;

-- The column default can't reference another column, so add_task sets it explicitly.
alter table public.tasks drop constraint tasks_check1;
alter table public.tasks add constraint tasks_status_fields check (
     (status = 'open'       and done_claimed_at is null     and completed_at is null and info_requested_at is null)
  or (status = 'pending'    and done_claimed_at is not null and completed_at is null and info_requested_at is null)
  or (status = 'needs_info' and done_claimed_at is null     and completed_at is null and info_requested_at is not null
                            and info_question is not null)
  or (status = 'done'       and completed_at is not null    and closed_by is not null and info_requested_at is null)
);
alter table public.tasks add constraint tasks_clock_after_request check (clock_started_at >= requested_at);

alter table public.task_events drop constraint task_events_kind_check;
alter table public.task_events add constraint task_events_kind_check check (kind in (
  'created', 'claimed', 'closed', 'rejected', 'archived', 'restored', 'info_requested', 'info_provided'
));

-- Who holds the ball: the requester while waiting for info, otherwise the assignee.
create or replace function public.task_holder(t public.tasks)
returns uuid
language sql stable
set search_path = ''
as $$ select case when t.status = 'needs_info' then t.created_by else t.assignee end $$;

-- Days on the holder's clock.
--   needs_info: since the question was asked (charged to the requester).
--   otherwise:  from clock_started_at (the request date, or the day info was provided)
--               until completion / the "سوّيتها" moment / now.
create or replace function public.task_days(t public.tasks)
returns integer
language sql stable
set search_path = ''
as $$
  select greatest(0,
    case when t.status = 'needs_info' then
      (now() at time zone 'Asia/Riyadh')::date - (t.info_requested_at at time zone 'Asia/Riyadh')::date
    else
      (coalesce(t.completed_at, t.done_claimed_at, now()) at time zone 'Asia/Riyadh')::date - t.clock_started_at
    end
  )::integer
$$;

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

  insert into public.tasks (title, created_by, assignee, requested_at, clock_started_at)
  values (btrim(p_title), v_me, v_other, v_date, v_date)
  returning * into r;

  perform private.log_event(r, 'created');
  return r;
end $$;

-- Mohammad only: close. Not while the task is waiting for info.
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
  if r.status = 'needs_info' then perform private.deny('المهمة بانتظار توضيح، ردّ عليها أول'); end if;

  update public.tasks
     set status = 'done',
         completed_at = coalesce(done_claimed_at, now()),
         closed_by = auth.uid()
   where id = p_task_id
  returning * into r;
  perform private.log_event(r, 'closed');
  return r;
end $$;

-- Assignee (either person): "أحتاج توضيح ❓" on an open task → back to the requester.
create or replace function public.request_info(p_task_id bigint, p_question text)
returns public.tasks
language plpgsql
security definer
set search_path = ''
as $$
declare r public.tasks; v_days integer;
begin
  if not private.is_participant() then perform private.deny('غير مصرّح'); end if;
  if p_question is null or char_length(btrim(p_question)) = 0 then
    raise exception 'اكتب وش المعلومات اللي تحتاجها' using errcode = '22023';
  end if;
  select * into r from public.tasks where id = p_task_id for update;
  if not found or r.archived_at is not null then perform private.deny('المهمة غير موجودة'); end if;
  if r.assignee <> auth.uid() then perform private.deny('تطلب توضيح على مهامك أنت بس'); end if;
  if r.status <> 'open' then perform private.deny('المهمة ليست مفتوحة'); end if;

  v_days := public.task_days(r); -- the assignee's count when they asked, for the log
  update public.tasks
     set status = 'needs_info', info_requested_at = now(), info_question = left(btrim(p_question), 500)
   where id = p_task_id
  returning * into r;
  insert into public.task_events (task_id, actor, kind, days, note)
  values (r.id, auth.uid(), 'info_requested', v_days, r.info_question);
  return r;
end $$;

-- Requester only: answer → back to the assignee, whose counter starts again from today.
create or replace function public.provide_info(p_task_id bigint, p_answer text)
returns public.tasks
language plpgsql
security definer
set search_path = ''
as $$
declare r public.tasks; v_waited integer;
begin
  if not private.is_participant() then perform private.deny('غير مصرّح'); end if;
  if p_answer is null or char_length(btrim(p_answer)) = 0 then
    raise exception 'اكتب التوضيح' using errcode = '22023';
  end if;
  select * into r from public.tasks where id = p_task_id for update;
  if not found or r.archived_at is not null then perform private.deny('المهمة غير موجودة'); end if;
  if r.created_by <> auth.uid() then perform private.deny('التوضيح من صاحب الطلب بس'); end if;
  if r.status <> 'needs_info' then perform private.deny('المهمة ما تنتظر توضيح'); end if;

  v_waited := public.task_days(r); -- days the requester kept the ball
  update public.tasks
     set status = 'open', info_requested_at = null, info_question = null,
         clock_started_at = public.riyadh_today()
   where id = p_task_id
  returning * into r;
  insert into public.task_events (task_id, actor, kind, days, note)
  values (r.id, auth.uid(), 'info_provided', v_waited, left(btrim(p_answer), 500));
  return r;
end $$;

revoke execute on function public.request_info(bigint, text), public.provide_info(bigint, text) from public, anon;
grant execute on function public.request_info(bigint, text), public.provide_info(bigint, text) to authenticated;

-- clock_started_at only moves forward, and only through provide_info.
create or replace function private.freeze_task_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.requested_at <> old.requested_at or new.created_by <> old.created_by
     or new.assignee <> old.assignee or new.created_at <> old.created_at
     or new.clock_started_at < old.clock_started_at then
    raise exception 'requested_at / created_by / assignee are immutable';
  end if;
  return new;
end $$;

-- Push for the new events too.
create or replace function private.on_task_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.kind in ('created', 'claimed', 'closed', 'rejected', 'info_requested', 'info_provided') then
    perform private.fire_notify(jsonb_build_object('type', 'event', 'event_id', new.id));
  end if;
  return new;
end $$;
