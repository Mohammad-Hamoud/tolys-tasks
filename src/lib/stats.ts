import { daysBetween, riyadhDate, taskDays } from '@shared/days.ts';
import type { Profile, Task } from './types';

export interface PersonStats {
  profile: Profile;
  /** Average days to close (done tasks). null = nothing closed yet. */
  avgClose: number | null;
  closed: number;
  open: number;
  /** Share of tasks added in the last 30 days that are done. null = none added. */
  rate30: number | null;
  added30: number;
  done30: number;
}

export interface Stats {
  people: PersonStats[];
  /** Oldest 3 unfinished tasks (wall of shame). */
  wall: { task: Task; days: number }[];
  /** Who is slower on average, when both have closed something. */
  slower: PersonStats | null;
  faster: PersonStats | null;
  gap: number;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export function computeStats(tasks: Task[], profiles: Profile[], now: Date = new Date()): Stats {
  const active = tasks.filter((t) => !t.archived_at);
  const today = riyadhDate(now);

  const people = profiles.map<PersonStats>((profile) => {
    const mine = active.filter((t) => t.assignee === profile.id);
    const done = mine.filter((t) => t.status === 'done');
    const recent = mine.filter((t) => daysBetween(riyadhDate(t.created_at), today) < 30);
    const recentDone = recent.filter((t) => t.status === 'done');
    return {
      profile,
      avgClose: mean(done.map((t) => taskDays(t, now))),
      closed: done.length,
      open: mine.length - done.length,
      rate30: recent.length ? recentDone.length / recent.length : null,
      added30: recent.length,
      done30: recentDone.length,
    };
  });

  const wall = active
    .filter((t) => t.status !== 'done')
    .map((task) => ({ task, days: taskDays(task, now) }))
    .sort((a, b) => b.days - a.days || a.task.created_at.localeCompare(b.task.created_at))
    .slice(0, 3);

  let slower: PersonStats | null = null;
  let faster: PersonStats | null = null;
  let gap = 0;
  const [a, b] = people;
  if (a && b && a.avgClose !== null && b.avgClose !== null) {
    [slower, faster] = a.avgClose >= b.avgClose ? [a, b] : [b, a];
    gap = slower.avgClose! - faster.avgClose!;
  }

  return { people, wall, slower, faster, gap };
}
