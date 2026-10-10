import { useEffect, useMemo, useState } from 'react';
import { daysBetween, riyadhDate, taskDays } from '@shared/days.ts';
import { useApp } from '../lib/app';
import { getPushState, isIOS, isStandalone, type PushState } from '../lib/push';
import { navigate } from '../lib/router';
import type { Task } from '../lib/types';
import { TaskCard, useTaskActions } from '../components/TaskCard';
import { AddTaskSheet } from '../components/AddTaskSheet';
import { Empty } from '../components/ui';

type Tab = 'mine' | 'theirs' | 'done';

const oldestFirst = (a: Task, b: Task) => taskDays(b) - taskDays(a) || a.created_at.localeCompare(b.created_at);

export function TasksPage() {
  const { tasks, me, other, isAdmin, g } = useApp();
  const { actions, sheet } = useTaskActions();
  const [tab, setTab] = useState<Tab>('mine');
  const [adding, setAdding] = useState(false);
  const [push, setPush] = useState<PushState | null>(null);

  useEffect(() => {
    getPushState().then(setPush);
  }, []);

  const active = useMemo(() => tasks.filter((t) => !t.archived_at), [tasks]);
  const mineOpen = active.filter((t) => t.assignee === me.id && t.status !== 'done');
  const theirsOpen = active.filter((t) => t.assignee === other.id && t.status !== 'done');
  const today = riyadhDate();
  const doneRecent = active
    .filter((t) => t.status === 'done' && daysBetween(riyadhDate(t.completed_at!), today) <= 30)
    .sort((a, b) => b.completed_at!.localeCompare(a.completed_at!));

  // Home Screen badge = my unfinished tasks (where supported).
  useEffect(() => {
    const nav = navigator as Navigator & { setAppBadge?: (n: number) => Promise<void> };
    nav.setAppBadge?.(mineOpen.length).catch(() => {});
  }, [mineOpen.length]);

  const list = tab === 'mine' ? mineOpen : tab === 'theirs' ? theirsOpen : doneRecent;
  const pending = list.filter((t) => t.status === 'pending').sort(oldestFirst);
  const open = list.filter((t) => t.status === 'open').sort(oldestFirst);

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: 'mine', label: 'عندي', count: mineOpen.length },
    { key: 'theirs', label: `عند ${other.display_name}`, count: theirsOpen.length },
    { key: 'done', label: 'المنجزة' },
  ];

  return (
    <div className="space-y-4">
      {push === 'needs-install' && isIOS() && !isStandalone() && (
        <button onClick={() => navigate('/ios')} className="w-full rounded-3xl bg-brand-soft p-4 text-start">
          <p className="font-bold">📲 ثبّت التطبيق على الشاشة الرئيسية</p>
          <p className="text-[14px] text-muted">عشان توصلك الإشعارات على الآيفون. اضغط هنا للشرح.</p>
        </button>
      )}
      {push === 'off' && (
        <button onClick={() => navigate('/settings')} className="w-full rounded-3xl bg-warn-soft p-4 text-start">
          <p className="font-bold text-warn">🔔 الإشعارات مطفية</p>
          <p className="text-[14px] text-muted">فعّلها من الإعدادات عشان ما تفوتك مهمة (ولا فضيحة).</p>
        </button>
      )}

      <div className="grid grid-cols-3 gap-1 rounded-2xl bg-surface-2 p-1" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`min-h-10 rounded-xl text-[15px] font-bold transition ${tab === t.key ? 'bg-surface shadow-sm' : 'text-muted'}`}
          >
            {t.label}
            {t.count !== undefined && <span className="num ms-1 text-[13px] opacity-70">({t.count})</span>}
          </button>
        ))}
      </div>

      {pending.length > 0 && (
        <section className="space-y-2">
          <h2 className="px-1 text-[14px] font-bold text-warn">
            ⏳ {isAdmin ? 'بانتظار اعتمادك' : 'بانتظار تأكيد محمد'}
          </h2>
          {pending.map((t) => (
            <TaskCard key={t.id} task={t} actions={actions} />
          ))}
        </section>
      )}

      <section className="space-y-2">
        {pending.length > 0 && open.length > 0 && <h2 className="px-1 text-[14px] font-bold text-muted">مفتوحة</h2>}
        {open.map((t) => (
          <TaskCard key={t.id} task={t} actions={actions} />
        ))}
        {tab === 'done' && doneRecent.map((t) => <TaskCard key={t.id} task={t} actions={actions} />)}
      </section>

      {list.length === 0 &&
        (tab === 'mine' ? (
          <Empty emoji="🏖️" title="ما عندك ولا مهمة" hint="استمتع… قبل لا تجيك وحدة" />
        ) : tab === 'theirs' ? (
          <Empty
            emoji="📭"
            title={`${other.display_name} ما ${g(other, 'عنده', 'عندها')} شي`}
            hint={`اضغط + وأرسل ${g(other, 'له', 'لها')} مهمة`}
          />
        ) : (
          <Empty emoji="🦗" title="ما فيه مهام منجزة آخر 30 يوم" hint="صمت… مريب" />
        ))}

      <button
        onClick={() => setAdding(true)}
        className="fixed bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] left-1/2 z-30 flex h-14 -translate-x-1/2 items-center gap-2 rounded-full bg-brand px-6 text-[17px] font-bold text-brand-ink shadow-xl active:scale-95"
      >
        <span className="text-2xl leading-none">+</span> مهمة لـ{other.display_name}
      </button>
      <div className="h-16" />

      <AddTaskSheet open={adding} onClose={() => setAdding(false)} />
      {sheet}
    </div>
  );
}
