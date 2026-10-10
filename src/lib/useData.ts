import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';
import type { Profile, Task, TaskEvent } from './types';

export interface Data {
  profiles: Profile[];
  tasks: Task[];
  events: TaskEvent[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

/** Loads everything (two people, small data) and stays live via Realtime. */
export function useData(): Data {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [events, setEvents] = useState<TaskEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const [p, t, e] = await Promise.all([
      supabase.from('profiles').select('id, display_name, role'),
      supabase.from('tasks').select('*').order('created_at', { ascending: false }),
      supabase.from('task_events').select('*').order('id', { ascending: false }).limit(500),
    ]);
    const err = p.error ?? t.error ?? e.error;
    if (err) {
      setError(err.message);
    } else {
      setProfiles(p.data as Profile[]);
      setTasks(t.data as Task[]);
      setEvents(e.data as TaskEvent[]);
      setError(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    reload();
    const channel = supabase
      .channel('tasks-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => reload())
      .subscribe();
    const onVisible = () => document.visibilityState === 'visible' && reload();
    document.addEventListener('visibilitychange', onVisible);
    // Day counters roll over at midnight even when nothing changes.
    const tick = window.setInterval(reload, 5 * 60_000);
    return () => {
      supabase.removeChannel(channel);
      document.removeEventListener('visibilitychange', onVisible);
      window.clearInterval(tick);
    };
  }, [reload]);

  return { profiles, tasks, events, loading, error, reload };
}
