import { useState } from 'react';
import { clockRestarted, daysLabel, daysUnit, isBackdated, taskDays } from '@shared/days.ts';
import { api } from '../lib/supabase';
import { useApp } from '../lib/app';
import { fmtDay, fmtMoment } from '../lib/format';
import { navigate } from '../lib/router';
import type { Task } from '../lib/types';
import { Button, ShameBadge, Sheet, useToast } from './ui';

type AskKind = 'reject' | 'archive' | 'info' | 'answer';
type Pending = { kind: AskKind; task: Task } | null;

const ASK: Record<AskKind, { title: string; submit: string; placeholder: string; required: boolean; variant: 'danger' | 'primary' }> = {
  reject: { title: 'رفض الإنجاز ❌', submit: 'ارفض', placeholder: 'السبب (اختياري): مثلاً ما انغسلت زين', required: false, variant: 'danger' },
  archive: { title: 'حذف المهمة 🗑️', submit: 'احذف', placeholder: 'السبب (اختياري)', required: false, variant: 'danger' },
  info: { title: 'أحتاج توضيح ❓', submit: 'أرسل السؤال', placeholder: 'وش تحتاج تعرف؟ مثلاً: أي ستارة تقصد؟', required: true, variant: 'primary' },
  answer: { title: 'رد بالتوضيح ↩️', submit: 'أرسل التوضيح', placeholder: 'اكتب التوضيح…', required: true, variant: 'primary' },
};

/** Action buttons only appear when the database would allow them. The DB still checks. */
export function useTaskActions() {
  const { reload, me, name } = useApp();
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
    askReject: (t: Task) => open('reject', t),
    askArchive: (t: Task) => open('archive', t),
    askInfo: (t: Task) => open('info', t),
    askAnswer: (t: Task) => open('answer', t),
  };

  function open(kind: AskKind, task: Task) {
    setReason('');
    setAsk({ kind, task });
  }

  function hint(kind: AskKind, t: Task): string {
    switch (kind) {
      case 'reject':
        return ' — يُلغى وقت «سوّيتها» ويكمّل العد من تاريخ الطلب.';
      case 'archive':
        return ' — تنتقل للأرشيف مع السجل، وما ينحذف شي نهائياً.';
      case 'info':
        return ` — ترجع لـ${name(t.created_by)} والعداد يمشي على ${name(t.created_by)} لين يرد، وما ينحسب عليك تأخير. بعد الرد يبدأ عدّك من جديد.`;
      case 'answer':
        return ` — ترجع لـ${name(t.assignee)} ويبدأ العد من جديد من اليوم.`;
    }
  }

  const cfg = ask ? ASK[ask.kind] : null;
  const sheet = (
    <Sheet open={!!ask} onClose={() => setAsk(null)} title={cfg?.title ?? ''}>
      {ask && cfg && (
        <form
          className="space-y-3 pb-2"
          onSubmit={(e) => {
            e.preventDefault();
            const { kind, task } = ask;
            const text = reason.trim();
            if (cfg.required && !text) return;
            setAsk(null);
            if (kind === 'reject') run(`reject-${task.id}`, () => api.rejectDone(task.id, text || null), 'رُفض ❌ والعداد رجع يشتغل');
            else if (kind === 'archive') run(`archive-${task.id}`, () => api.archiveTask(task.id, text || null), 'انحذفت (وتقدر ترجعها من الأرشيف)');
            else if (kind === 'info') run(`info-${task.id}`, () => api.requestInfo(task.id, text), `الكورة في ملعب ${name(task.created_by)} الحين ⚽`);
            else run(`answer-${task.id}`, () => api.provideInfo(task.id, text), `رجعت لـ${name(task.assignee)} والعداد بدأ من جديد ↩️`);
          }}
        >
          <p className="text-[15px] text-muted">
            «{ask.task.title}»{hint(ask.kind, ask.task)}
          </p>
          {ask.kind === 'answer' && ask.task.info_question && (
            <p className="rounded-xl bg-surface-2 p-3 text-[15px]">
              ❓ {name(ask.task.assignee)}: «{ask.task.info_question}»
            </p>
          )}
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={ask.kind === 'info' || ask.kind === 'answer' ? 500 : 300}
            required={cfg.required}
            autoFocus={cfg.required}
            rows={cfg.required ? 3 : 1}
            placeholder={cfg.placeholder}
            className="w-full resize-none rounded-xl border border-line bg-bg px-3 py-3 text-[16px] outline-none focus:border-brand"
          />
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="secondary" onClick={() => setAsk(null)}>
              تراجع
            </Button>
            <Button type="submit" variant={cfg.variant} disabled={cfg.required && !reason.trim()}>
              {cfg.submit}
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
  const iAsked = task.created_by === me.id;
  const waiting = task.status === 'needs_info';
  const backdated = isBackdated(task);
  const restarted = clockRestarted(task);
  const b = actions.busy;
  const hasActions = isAdmin || (mine && task.status === 'open') || (iAsked && waiting);

  return (
    <article
      className={`rounded-3xl bg-surface p-4 shadow-[0_1px_0_var(--line)] ${task.status === 'pending' ? 'ring-2 ring-warn/50' : waiting ? 'ring-2 ring-brand/50' : ''}`}
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
            {restarted && task.status !== 'needs_info' && (
              <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-[13px] font-bold text-muted">
                🔄 العد من جديد <span className="num">{fmtDay(task.clock_started_at)}</span>
              </span>
            )}
            {waiting && (
              <span className="rounded-full bg-brand-soft px-2.5 py-0.5 text-[13px] font-bold text-brand">
                ❓ بانتظار توضيح من {name(task.created_by)}
              </span>
            )}
            {task.status === 'pending' && (
              <span className="rounded-full bg-warn-soft px-2.5 py-0.5 text-[13px] font-bold text-warn">⏳ بانتظار التأكيد</span>
            )}
            {task.status === 'done' && task.completed_at && (
              <span className="rounded-full bg-ok-soft px-2.5 py-0.5 text-[13px] font-bold text-ok">
                ✔️ <span className="num">{fmtMoment(task.completed_at)}</span>
              </span>
            )}
          </div>
          {waiting && task.info_question && (
            <p className="mt-2 rounded-xl bg-surface-2 px-3 py-2 text-[14px]">
              <span className="font-bold">{name(task.assignee)}:</span> «{task.info_question}»
            </p>
          )}
        </button>
        <div className="shrink-0 text-center" aria-label={`عدد الأيام: ${daysLabel(days)}`}>
          <div className={`num text-3xl leading-none font-bold ${days >= 5 && task.status !== 'done' ? 'text-danger' : ''}`}>{days}</div>
          <div className="mt-1 text-[12px] text-muted">{daysUnit(days)}</div>
          {waiting && <div className="mt-0.5 text-[11px] font-bold text-brand">على {name(task.created_by)}</div>}
        </div>
      </div>

      {hasActions && (
        <div className="mt-3 flex flex-wrap gap-2">
          {/* Wife: سوّيتها on her own open tasks. */}
          {!isAdmin && mine && task.status === 'open' && (
            <Button variant="warn" className="flex-1" busy={b === `claim-${task.id}`} onClick={() => actions.claim(task)}>
              سوّيتها ✋
            </Button>
          )}
          {/* Either person: answer an info request on a task they asked for. */}
          {iAsked && waiting && (
            <Button className="flex-1" busy={b === `answer-${task.id}`} onClick={() => actions.askAnswer(task)}>
              رد بالتوضيح ↩️
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
          {/* Either person: bounce their own open task back for more info. */}
          {mine && task.status === 'open' && (
            <Button variant="secondary" busy={b === `info-${task.id}`} onClick={() => actions.askInfo(task)}>
              أحتاج توضيح ❓
            </Button>
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
