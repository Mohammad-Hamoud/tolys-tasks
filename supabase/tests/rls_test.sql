-- RLS / permission tests. They run as the real `authenticated` role with each user's JWT claims.
-- Everything happens inside one transaction and is rolled back, so the data is untouched.
-- Run: paste into the Supabase SQL editor (or execute_sql). It raises on the first failure
-- and otherwise returns 'ALL PASSED'.
begin;

create temp table _results (name text, passed boolean) on commit drop;
grant all on _results to authenticated, anon;

create or replace function pg_temp.as_user(p_email text) returns void language plpgsql as $$
declare v_id uuid;
begin
  perform set_config('role', 'postgres', true);
  select id into v_id from auth.users where email = p_email;
  perform set_config('request.jwt.claims', json_build_object('sub', v_id, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

create or replace function pg_temp.as_anon() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('role', 'anon', true);
end $$;

-- Runs SQL and records whether it was denied (raised an error) as expected.
create or replace function pg_temp.expect_denied(p_name text, p_sql text) returns void language plpgsql as $$
declare v_ok boolean := false; v_rows int;
begin
  begin
    execute p_sql;
    get diagnostics v_rows = row_count;
    -- An UPDATE/DELETE silently filtered by RLS (0 rows) also counts as denied.
    v_ok := v_rows = 0 and p_sql ~* '^\s*(update|delete)';
  exception when others then v_ok := true;
  end;
  insert into _results values (p_name, v_ok);
end $$;

create or replace function pg_temp.expect(p_name text, p_ok boolean) returns void language plpgsql as $$
begin insert into _results values (p_name, coalesce(p_ok, false)); end $$;

do $$
declare
  mo uuid := (select id from auth.users where email = 'mohammad@example.com');
  ba uuid := (select id from auth.users where email = 'bandoor@example.com');
  t1 public.tasks; t2 public.tasks; r public.tasks; n int; kinds text;
begin
  -- Anonymous
  perform pg_temp.as_anon();
  perform pg_temp.expect_denied('anon cannot read tasks', 'select * from public.tasks');
  perform pg_temp.expect_denied('anon cannot add task', $q$ select public.add_task('x') $q$);

  -- Direct writes
  perform pg_temp.as_user('mohammad@example.com');
  perform pg_temp.expect_denied('admin cannot insert directly',
    format($q$ insert into public.tasks (title, created_by, assignee, requested_at) values ('x', %L, %L, current_date) $q$, mo, ba));

  -- add_task: assignee is always the other person
  t1 := public.add_task('اختبار: مهمة لبندور');
  perform pg_temp.expect('admin task goes to member', t1.assignee = ba and t1.requested_at = public.riyadh_today());

  perform pg_temp.as_user('bandoor@example.com');
  t2 := public.add_task('اختبار: مهمة لمحمد', public.riyadh_today() - 7);
  perform pg_temp.expect('member task goes to admin with backdate', t2.assignee = mo and t2.requested_at = public.riyadh_today() - 7);
  perform pg_temp.expect('days counter counts from request date', public.task_days(t2) = 7);
  perform pg_temp.expect_denied('future request date rejected', $q$ select public.add_task('f', public.riyadh_today() + 1) $q$);
  perform pg_temp.expect_denied('empty title rejected', $q$ select public.add_task('   ') $q$);
  perform pg_temp.expect_denied('member cannot update tasks directly', $q$ update public.tasks set title = 'hacked' $q$);
  perform pg_temp.expect_denied('member cannot change requested_at', $q$ update public.tasks set requested_at = current_date - 100 $q$);
  perform pg_temp.expect_denied('member cannot hard-delete', $q$ delete from public.tasks $q$);
  perform pg_temp.expect_denied('member cannot delete audit log', $q$ delete from public.task_events $q$);

  -- سوّيتها: member on her own open task only
  perform pg_temp.expect_denied('member cannot claim a task assigned to admin', format('select public.claim_done(%s)', t2.id));
  perform pg_temp.as_user('mohammad@example.com');
  perform pg_temp.expect_denied('admin cannot press سوّيتها', format('select public.claim_done(%s)', t1.id));
  perform pg_temp.as_user('bandoor@example.com');
  r := public.claim_done(t1.id);
  perform pg_temp.expect('member claims own task → pending', r.status = 'pending' and r.done_claimed_at is not null);
  perform pg_temp.expect_denied('member cannot close', format('select public.close_task(%s)', t1.id));
  perform pg_temp.expect_denied('member cannot reject', format('select public.reject_done(%s)', t1.id));
  perform pg_temp.expect_denied('member cannot archive', format('select public.archive_task(%s)', t2.id));

  -- Admin: reject, approve, close own, archive, restore
  perform pg_temp.as_user('mohammad@example.com');
  r := public.reject_done(t1.id, 'ما انغسلت زين');
  perform pg_temp.expect('reject → open and claim time cleared', r.status = 'open' and r.done_claimed_at is null);
  perform pg_temp.as_user('bandoor@example.com');
  perform public.claim_done(t1.id);
  perform pg_temp.as_user('mohammad@example.com');
  r := public.close_task(t1.id);
  perform pg_temp.expect('approve → completion = claim time', r.status = 'done' and r.completed_at = r.done_claimed_at);
  r := public.close_task(t2.id);
  perform pg_temp.expect('admin closes own task directly', r.status = 'done' and r.completed_at is not null);
  perform pg_temp.expect('closed task keeps its day count', public.task_days(r) = 7);
  perform pg_temp.expect_denied('admin cannot close twice', format('select public.close_task(%s)', t2.id));
  r := public.archive_task(t2.id, 'اختبار');
  perform pg_temp.expect('archive is soft', r.archived_at is not null and exists (select 1 from public.tasks where id = t2.id));
  perform pg_temp.expect_denied('admin cannot hard-delete', $q$ delete from public.tasks $q$);
  r := public.restore_task(t2.id);
  perform pg_temp.expect('admin restores', r.archived_at is null);

  -- Audit log
  select string_agg(kind, ',' order by id) into kinds from public.task_events where task_id = t1.id;
  perform pg_temp.expect('audit log complete', kinds = 'created,claimed,rejected,claimed,closed');

  -- طلب معلومات إضافية: assignee bounces, requester answers, the clock restarts
  perform pg_temp.as_user('mohammad@example.com');
  t1 := public.add_task('اختبار: توضيح', public.riyadh_today() - 6);
  perform pg_temp.expect_denied('requester cannot ask info on own request', format($q$ select public.request_info(%s, 'x') $q$, t1.id));
  perform pg_temp.as_user('bandoor@example.com');
  perform pg_temp.expect_denied('info request needs a question', format($q$ select public.request_info(%s, '  ') $q$, t1.id));
  r := public.request_info(t1.id, 'أي ستارة؟');
  perform pg_temp.expect('assignee asks → needs_info, ball with requester', r.status = 'needs_info' and public.task_holder(r) = mo);
  perform pg_temp.expect('requester clock starts at zero', public.task_days(r) = 0);
  perform pg_temp.expect_denied('assignee cannot answer own question', format($q$ select public.provide_info(%s, 'x') $q$, t1.id));
  perform pg_temp.expect_denied('cannot claim while waiting for info', format('select public.claim_done(%s)', t1.id));
  perform pg_temp.as_user('mohammad@example.com');
  perform pg_temp.expect_denied('cannot close while waiting for info', format('select public.close_task(%s)', t1.id));
  r := public.provide_info(t1.id, 'الرمادية');
  perform pg_temp.expect('answer → open, back to assignee, clock restarted',
    r.status = 'open' and public.task_holder(r) = ba and r.clock_started_at = public.riyadh_today()
    and r.requested_at = public.riyadh_today() - 6 and public.task_days(r) = 0);
  select string_agg(kind, ',' order by id) into kinds from public.task_events where task_id = t1.id;
  perform pg_temp.expect('info round logged', kinds = 'created,info_requested,info_provided');
  perform pg_temp.as_user('bandoor@example.com');
  perform pg_temp.expect_denied('member cannot rewind the clock',
    format($q$ update public.tasks set clock_started_at = requested_at where id = %s $q$, t1.id));

  -- Push subscriptions are private
  perform pg_temp.as_user('bandoor@example.com');
  perform public.save_push_subscription('https://example.com/rls-test', 'x', 'y');
  perform pg_temp.as_user('mohammad@example.com');
  select count(*) into n from public.push_subscriptions where endpoint = 'https://example.com/rls-test';
  perform pg_temp.expect('admin cannot see member push subscriptions', n = 0);
  perform pg_temp.expect_denied('service config is not readable by users', 'select public.get_service_config()');

  perform set_config('role', 'postgres', true);
end $$;

select coalesce(string_agg(case when passed then 'PASS  ' else 'FAIL  ' end || name, E'\n'), '') as report,
       case when bool_and(passed) then 'ALL PASSED' else 'FAILURES' end as result
from _results;

rollback;
