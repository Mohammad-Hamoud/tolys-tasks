-- Info requests now FREEZE the assignee's clock instead of resetting it.
-- On answer, clock_started_at moves forward by exactly the days spent waiting, so the assignee
-- resumes from where they stopped. The task can bounce back for info any number of times;
-- each round pauses the clock again.

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
         clock_started_at = clock_started_at + v_waited
   where id = p_task_id
  returning * into r;
  insert into public.task_events (task_id, actor, kind, days, note)
  values (r.id, auth.uid(), 'info_provided', v_waited, left(btrim(p_answer), 500));
  return r;
end $$;
