import { useApp } from '../lib/app';
import { fmtMoment } from '../lib/format';
import { navigate } from '../lib/router';
import { useTaskActions } from '../components/TaskCard';
import { EVENT_TEXT } from '../components/TaskDetail';
import { Button, Card, Empty } from '../components/ui';

export function ArchivePage() {
  const { tasks, events, isAdmin, name, profiles } = useApp();
  const { actions, sheet } = useTaskActions();
  const archived = tasks.filter((t) => t.archived_at).sort((a, b) => b.archived_at!.localeCompare(a.archived_at!));
  const titleOf = (id: number) => tasks.find((t) => t.id === id)?.title ?? '—';
  const fem = (id: string) => profiles.find((p) => p.id === id)?.role === 'member';

  return (
    <div className="space-y-4">
      <Card>
        <h2 className="font-bold">🗑️ المحذوفة</h2>
        <p className="text-[13px] text-muted">الحذف أرشفة فقط، وما ينحذف شي نهائياً.</p>
        <div className="mt-3 space-y-2">
          {archived.length === 0 ? (
            <Empty emoji="🫙" title="الأرشيف فاضي" />
          ) : (
            archived.map((t) => (
              <div key={t.id} className="flex items-center gap-3 rounded-2xl bg-surface-2 p-3">
                <button className="min-w-0 flex-1 text-start" onClick={() => navigate(`/task/${t.id}`)}>
                  <p className="truncate font-bold">{t.title}</p>
                  <p className="text-[13px] text-muted">
                    {name(t.archived_by)} · <span className="num">{fmtMoment(t.archived_at!)}</span>
                    {t.archive_reason && ` · «${t.archive_reason}»`}
                  </p>
                </button>
                {isAdmin && (
                  <Button variant="secondary" busy={actions.busy === `restore-${t.id}`} onClick={() => actions.restore(t)}>
                    استرجاع ♻️
                  </Button>
                )}
              </div>
            ))
          )}
        </div>
      </Card>

      <Card>
        <h2 className="font-bold">📜 سجل النشاط</h2>
        <ol className="mt-3 space-y-1">
          {events.slice(0, 60).map((e) => (
            <li key={e.id}>
              <button onClick={() => navigate(`/task/${e.task_id}`)} className="flex w-full gap-2 rounded-xl px-1 py-2 text-start text-[14px]">
                <span aria-hidden>{EVENT_TEXT[e.kind].icon}</span>
                <span className="min-w-0 flex-1">
                  <span className="font-bold">{name(e.actor)}</span>{' '}
                  {fem(e.actor)
                    ? EVENT_TEXT[e.kind].text.replace(/^(أضاف|ضغط|أغلق|رفض|حذف|استرجع|طلب|رد)/, '$1ت')
                    : EVENT_TEXT[e.kind].text}
                  : «{titleOf(e.task_id)}»
                  <span className="num block text-[12px] text-muted">{fmtMoment(e.created_at)}</span>
                </span>
              </button>
            </li>
          ))}
          {events.length === 0 && <p className="text-muted">ما فيه نشاط بعد.</p>}
        </ol>
      </Card>
      {sheet}
    </div>
  );
}
