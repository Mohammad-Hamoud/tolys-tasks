import { clockRestarted, daysLabel, isBackdated, taskDays } from '@shared/days.ts';
import { shameText } from '@shared/shame.ts';
import { useApp } from '../lib/app';
import { fmtDay, fmtMoment } from '../lib/format';
import type { EventKind } from '../lib/types';
import { Sheet } from './ui';
import { TaskCard, useTaskActions } from './TaskCard';

export const EVENT_TEXT: Record<EventKind, { icon: string; text: string }> = {
  created: { icon: '📌', text: 'أضاف المهمة' },
  claimed: { icon: '✋', text: 'ضغط سوّيتها' },
  closed: { icon: '✔️', text: 'أغلق المهمة' },
  rejected: { icon: '❌', text: 'رفض الإنجاز' },
  archived: { icon: '🗑️', text: 'حذف المهمة (أرشفة)' },
  restored: { icon: '♻️', text: 'استرجع المهمة' },
  info_requested: { icon: '❓', text: 'طلب توضيح' },
  info_provided: { icon: '↩️', text: 'رد بالتوضيح' },
};

export function TaskDetail({ id, onClose }: { id: number; onClose: () => void }) {
  const { tasks, events, name, profiles } = useApp();
  const { actions, sheet } = useTaskActions();
  const task = tasks.find((t) => t.id === id);
  const log = events.filter((e) => e.task_id === id).sort((a, b) => a.id - b.id);

  return (
    <>
      <Sheet open onClose={onClose} title="تفاصيل المهمة">
        {!task ? (
          <p className="pb-6 text-muted">المهمة غير موجودة.</p>
        ) : (
          <div className="space-y-4 pb-4">
            {task.archived_at ? (
              <div className="rounded-2xl bg-surface-2 p-3 text-[15px]">
                🗑️ محذوفة (في الأرشيف) {task.archive_reason ? `— ${task.archive_reason}` : ''}
              </div>
            ) : (
              <TaskCard task={task} actions={actions} />
            )}
            <dl className="grid grid-cols-2 gap-2 text-[14px]">
              <div className="rounded-2xl bg-surface-2 p-3">
                <dt className="text-muted">تاريخ الطلب</dt>
                <dd className="num font-bold">{fmtDay(task.requested_at)}</dd>
              </div>
              <div className="rounded-2xl bg-surface-2 p-3">
                <dt className="text-muted">أُضيفت فعلياً</dt>
                <dd className="num font-bold">{fmtMoment(task.created_at)}</dd>
              </div>
              <div className="col-span-2 rounded-2xl bg-surface-2 p-3">
                <dt className="text-muted">العداد</dt>
                <dd className="font-bold">
                  {daysLabel(taskDays(task))} · {shameText(taskDays(task))}
                  {task.status === 'needs_info' && ` · على ${name(task.created_by)} لين يرد بالتوضيح`}
                  {isBackdated(task) && ' · 📅 تاريخ معدّل'}
                  {clockRestarted(task) && task.status !== 'needs_info' && (
                    <span className="num"> · 🔄 العد من جديد من {fmtDay(task.clock_started_at)}</span>
                  )}
                </dd>
              </div>
            </dl>
            <div>
              <h3 className="mb-2 font-bold">السجل</h3>
              <ol className="space-y-2">
                {log.map((e) => {
                  const actor = profiles.find((p) => p.id === e.actor);
                  return (
                    <li key={e.id} className="flex gap-3 rounded-2xl border border-line p-3 text-[14px]">
                      <span aria-hidden>{EVENT_TEXT[e.kind].icon}</span>
                      <div className="min-w-0 flex-1">
                        <p className="font-bold">
                          {name(e.actor)} {actor?.role === 'member' ? EVENT_TEXT[e.kind].text.replace(/^(أضاف|ضغط|أغلق|رفض|حذف|استرجع|طلب|رد)/, '$1ت') : EVENT_TEXT[e.kind].text}
                        </p>
                        {e.note && <p className="text-muted">«{e.note}»</p>}
                        <p className="num text-[12px] text-muted">
                          {fmtMoment(e.created_at)} · {daysLabel(e.days)}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>
          </div>
        )}
      </Sheet>
      {sheet}
    </>
  );
}
