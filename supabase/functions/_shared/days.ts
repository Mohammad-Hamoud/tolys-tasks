// Day counting, shared by the web app and the "notify" Edge Function.
// Must match public.task_days() in the database.

export const TIME_ZONE = 'Asia/Riyadh';

const ymd = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Calendar date (YYYY-MM-DD) of an instant, in Riyadh time. */
export function riyadhDate(at: Date | string | number = new Date()): string {
  return ymd.format(new Date(at));
}

/** Whole days between two YYYY-MM-DD dates (b - a). */
export function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}

export interface CountableTask {
  requested_at: string;
  created_at: string;
  completed_at: string | null;
  done_claimed_at: string | null;
}

/**
 * Days from the request date until the completion moment.
 * Done → completed_at. Pending → frozen at the "سوّيتها" moment. Open → now.
 */
export function taskDays(t: CountableTask, now: Date = new Date()): number {
  const end = t.completed_at ?? t.done_claimed_at ?? now;
  return Math.max(0, daysBetween(t.requested_at, riyadhDate(end)));
}

/** True when the request date differs from the actual day the task was added ("📅 تاريخ معدّل"). */
export function isBackdated(t: Pick<CountableTask, 'requested_at' | 'created_at'>): boolean {
  return t.requested_at !== riyadhDate(t.created_at);
}

/** Arabic day count: "يوم واحد", "يومين", "3 أيام", "11 يوم" (Western digits, as in the UI). */
export function daysLabel(n: number): string {
  if (n === 0) return 'أقل من يوم';
  if (n === 1) return 'يوم واحد';
  if (n === 2) return 'يومين';
  if (n >= 3 && n <= 10) return `${n} أيام`;
  return `${n} يوم`;
}

/** The unit word shown under a big number: "يوم" / "يومين" / "أيام". */
export function daysUnit(n: number): string {
  if (n === 2) return 'يومين';
  if (n >= 3 && n <= 10) return 'أيام';
  return 'يوم';
}
