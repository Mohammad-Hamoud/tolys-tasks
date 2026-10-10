import { useState } from 'react';
import { daysLabel, daysUnit, isBackdated, taskDays } from '@shared/days.ts';
import { api } from '../lib/supabase';
import { useApp } from '../lib/app';
import { fmtDay, fmtMoment } from '../lib/format';
import { navigate } from '../lib/router';
import type { Task } from '../lib/types';
import { Button, ShameBadge, Sheet, useToast } from './ui';

type Pending = { kind: 'reject' | 'archive'; task: Task } | null;

/** Action buttons only appear when the database would allow them. The DB still checks. */
export function useTaskActions() {
  const { reload, me } = useApp();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [ask, setAsk] = useState<Pending>(null);
  const [reason, setReason] = useState('');

  async function run(key: string, fn: () => Promise<unknown>, okText: string) {
    setBusy(key);
    try {
      await fn();
      if ('vibrate' in navigator) navigator.vibrate?.(15);
      toast(okText);
      await reload();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(null);
    }
  }

  const actions = {
    busy,
    claim: (t: Task) => run(`claim-${t.id}`, () => api.claimDone(t.id), 'وصل لمحمد للاعتماد ✋'),
    close: (t: Task) =>
      run(`close-${t.id}`, () => api.closeTask(t.id), t.assignee === me.id ? 'تم ✔️ أحسنت' : 'اعتُمدت ✔️'),
    restore: (t: Task) => run(`restore-${t.id}`, () => api.restoreTask(t.id), 'رجعت المهمة ♻️'),
    askReject: (t: Task) => {
      setReason('');
      setAsk({ kind: 'reject', task: t });
    },
    askArchive: (t: Task) => {
      setReason('');
      setAsk({ kind: 'archive', task: t });
    },
  };

  const sheet = (
    <Sheet open={!!ask} onClose={() => setAsk(null)} title={ask?.kind === 'reject' ? 'رفض الإنجاز ❌' : 'حذف المهمة 🗑️'}>
      {ask && (
        <form
          className="space-y-3 pb-2"
          onSubmit={(e) => {
            e.preventDefault();
            const { kind, task } = ask;
            setAsk(null);
            if (kind === 'reject') run(`reject-${task.id}`, () => api.rejectDone(task.id, reason || null), 'رُفض ❌ والعداد رجع يشتغل');
            else run(`archive-${task.id}`, () => api.archiveTask(task.id, reason || null), 'انحذفت (وتقدر ترجعها من الأرشيف)');
          }}
        >
          <p className="text-[15px] text-muted">
            «{ask.task.title}»
            {ask.kind === 'reject'
              ? ' — يُلغى وقت «سوّيتها» ويكمّل العد من تاريخ الطلب.'
              : ' — تنتقل للأرشيف مع السجل، وما ينحذف شي نهائياً.'}
          </p>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={300}
            placeholder={ask.kind === 'reject' ? 'السبب (اختياري): مثلاً ما انغسلت زين' : 'السبب (اختياري)'}
            className="w-full rounded-xl border border-line bg-bg px-3 py-3 text-[16px] outline-none focus:border-brand"
          />
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="secondary" onClick={() => setAsk(null)}>
              تراجع
            </Button>
            <Button type="submit" variant="danger">
              {ask.kind === 'reject' ? 'ارفض' : 'احذف'}
            </Button>
          </div>
        </form>
      )}
    </Sheet>
  );

  return { actions, sheet };
}

export function TaskCard({ task, actions }: { task: Task; actions: ReturnType<typeof useTaskActions>['actions'] }) {
  const { me, isAdmin, name } = useApp();
  const days = taskDays(task);
  const mine = task.assignee === me.id;
  const backdated = isBackdated(task);
  const b = actions.busy;

  return (
    <article
      className={`rounded-3xl bg-surface p-4 shadow-[0_1px_0_var(--line)] ${task.status === 'pending' ? 'ring-2 ring-warn/50' : ''}`}
    >
      <div className="flex items-start gap-3">
        <button className="min-w-0 flex-1 text-start" onClick={() => navigate(`/task/${task.id}`)}>
          <h3 className={`text-[17px] leading-snug font-bold break-words ${task.status === 'done' ? 'text-muted line-through decoration-1' : ''}`}>
            {task.title}
          </h3>
          <p className="mt-1 text-[13px] text-muted">
            من {name(task.created_by)} ← على {name(task.assignee)} · طُلبت <span className="num">{fmtDay(task.requested_at)}</span>
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <ShameBadge days={days} />
            {backdated && <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-[13px] font-bold text-muted">📅 تاريخ معدّل</span>}
            {task.status === 'pending' && (
              <span className="rounded-full bg-warn-soft px-2.5 py-0.5 text-[13px] font-bold text-warn">⏳ بانتظار التأكيد</span>
            )}
            {task.status === 'done' && task.completed_at && (
              <span className="rounded-full bg-ok-soft px-2.5 py-0.5 text-[13px] font-bold text-ok">
                ✔️ <span className="num">{fmtMoment(task.completed_at)}</span>
              </span>
            )}
          </div>
        </button>
        <div className="shrink-0 text-center" aria-label={`عدد الأيام: ${daysLabel(days)}`}>
          <div className={`num text-3xl leading-none font-bold ${days >= 5 && task.status !== 'done' ? 'text-danger' : ''}`}>{days}</div>
          <div className="mt-1 text-[12px] text-muted">{daysUnit(days)}</div>
        </div>
      </div>

      {(isAdmin || (mine && task.status === 'open')) && (
        <div className="mt-3 flex flex-wrap gap-2">
          {/* Wife: سوّيتها on her own open tasks. */}
          {!isAdmin && mine && task.status === 'open' && (
            <Button variant="warn" className="flex-1" busy={b === `claim-${task.id}`} onClick={() => actions.claim(task)}>
              سوّيتها ✋
            </Button>
          )}
          {/* Mohammad: close / approve / reject / archive. */}
          {isAdmin && task.status === 'open' && (
            <Button variant="ok" className="flex-1" busy={b === `close-${task.id}`} onClick={() => actions.close(task)}>
              تم ✔️
            </Button>
          )}
          {isAdmin && task.status === 'pending' && (
            <>
              <Button variant="ok" className="flex-1" busy={b === `close-${task.id}`} onClick={() => actions.close(task)}>
                اعتماد ✔️
              </Button>
              <Button variant="danger" className="flex-1" busy={b === `reject-${task.id}`} onClick={() => actions.askReject(task)}>
                رفض ✖️
              </Button>
            </>
          )}
          {isAdmin && (
            <Button variant="ghost" className={task.status === 'done' ? 'ms-auto' : ''} aria-label="حذف" busy={b === `archive-${task.id}`} onClick={() => actions.askArchive(task)}>
              🗑️
            </Button>
          )}
        </div>
      )}
    </article>
  );
}
