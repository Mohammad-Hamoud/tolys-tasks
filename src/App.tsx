import { useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import { useData } from './lib/useData';
import { AppCtx, type AppState } from './lib/app';
import { navigate, useRoute } from './lib/router';
import { resyncPush } from './lib/push';
import { LoginPage } from './pages/LoginPage';
import { TasksPage } from './pages/TasksPage';
import { StatsPage } from './pages/StatsPage';
import { ArchivePage } from './pages/ArchivePage';
import { SettingsPage } from './pages/SettingsPage';
import { IosGuide } from './pages/IosGuide';
import { TaskDetail } from './components/TaskDetail';
import { Button } from './components/ui';
import type { Profile } from './lib/types';

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  if (session === undefined) return <Splash />;
  if (!session) return <LoginPage />;
  return <SignedIn userId={session.user.id} />;
}

function Splash() {
  return (
    <div className="grid min-h-dvh place-items-center">
      <img src="/icons/icon-192.png" alt="" className="size-16 animate-pulse rounded-2xl" />
    </div>
  );
}

const NAV = [
  { route: '/', name: 'tasks', icon: '📋', label: 'المهام' },
  { route: '/stats', name: 'stats', icon: '📊', label: 'الإحصاءات' },
  { route: '/archive', name: 'archive', icon: '🗂️', label: 'الأرشيف' },
  { route: '/settings', name: 'settings', icon: '⚙️', label: 'الإعدادات' },
] as const;

function SignedIn({ userId }: { userId: string }) {
  const data = useData();
  const route = useRoute();

  useEffect(() => {
    resyncPush();
  }, [userId]);

  const state = useMemo<AppState | null>(() => {
    const me = data.profiles.find((p) => p.id === userId);
    const other = data.profiles.find((p) => p.id !== userId);
    if (!me || !other) return null;
    const byId = new Map(data.profiles.map((p) => [p.id, p]));
    return {
      ...data,
      me,
      other,
      isAdmin: me.role === 'admin',
      name: (id) => (id ? byId.get(id)?.display_name ?? '—' : '—'),
      g: (p: Profile, m: string, f: string) => (p.role === 'member' ? f : m),
    };
  }, [data, userId]);

  if (data.loading) return <Splash />;
  if (!state) {
    return (
      <div className="grid min-h-dvh place-items-center p-6 text-center">
        <div>
          <p className="text-lg font-bold">{data.error ? 'تعذّر تحميل البيانات' : 'هذا الحساب غير مسجّل في التطبيق'}</p>
          <div className="mt-4 flex justify-center gap-2">
            <Button onClick={() => data.reload()}>إعادة المحاولة</Button>
            <Button variant="secondary" onClick={() => supabase.auth.signOut()}>
              خروج
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const page = route.name === 'task' ? 'tasks' : route.name;
  const titles: Record<string, string> = {
    tasks: `هلا ${state.me.display_name} 👋`,
    stats: 'الإحصاءات والفضايح',
    archive: 'الأرشيف والسجل',
    settings: 'الإعدادات',
    ios: 'إرشاد الآيفون',
  };

  return (
    <AppCtx.Provider value={state}>
      <div className="mx-auto min-h-dvh max-w-xl">
        <header className="pt-safe sticky top-0 z-20 bg-bg/90 px-4 pb-3 backdrop-blur">
          <div className="flex items-center justify-between">
            <h1 className="text-[22px] font-bold">{titles[page]}</h1>
            <span className="text-[13px] font-bold text-muted" dir="ltr">
              Toly's Tasks
            </span>
          </div>
        </header>

        <main className="px-4 pb-28">
          {page === 'tasks' && <TasksPage />}
          {page === 'stats' && <StatsPage />}
          {page === 'archive' && <ArchivePage />}
          {page === 'settings' && <SettingsPage />}
          {page === 'ios' && <IosGuide />}
        </main>

        <nav className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur">
          <ul className="mx-auto grid max-w-xl grid-cols-4">
            {NAV.map((n) => {
              const active = page === n.name;
              return (
                <li key={n.name}>
                  <button
                    onClick={() => navigate(n.route)}
                    aria-current={active ? 'page' : undefined}
                    className={`flex w-full flex-col items-center gap-0.5 pt-2 pb-1 text-[12px] font-bold ${active ? 'text-brand' : 'text-muted'}`}
                  >
                    <span className={`text-[22px] leading-none transition ${active ? '' : 'opacity-60 grayscale'}`} aria-hidden>
                      {n.icon}
                    </span>
                    {n.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>

      {route.name === 'task' && <TaskDetail id={route.id} onClose={() => navigate('/')} />}
    </AppCtx.Provider>
  );
}
