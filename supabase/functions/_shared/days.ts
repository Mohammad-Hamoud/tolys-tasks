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
  status?: string;
  /** Where the assignee's clock starts: the request date, or the day info was provided. */
  clock_started_at?: string;
  info_requested_at?: string | null;
}

/**
 * Days on the clock of whoever holds the ball. Must match public.task_days().
 * Waiting for info → since the question was asked (charged to the requester).
 * Otherwise → from clock_started_at until done / the "سوّيتها" moment / now.
 */
export function taskDays(t: CountableTask, now: Date = new Date()): number {
  if (t.status === 'needs_info' && t.info_requested_at) {
    return Math.max(0, daysBetween(riyadhDate(t.info_requested_at), riyadhDate(now)));
  }
  const end = t.completed_at ?? t.done_claimed_at ?? now;
  return Math.max(0, daysBetween(t.clock_started_at ?? t.requested_at, riyadhDate(end)));
}

/** Who holds the ball: the requester while waiting for info, otherwise the assignee. */
export function taskHolder(t: { status: string; created_by: string; assignee: string }): string {
  return t.status === 'needs_info' ? t.created_by : t.assignee;
}

/** True when the clock was restarted after an info request ("🔄 بدأ العد من جديد"). */
export function clockRestarted(t: Pick<CountableTask, 'requested_at' | 'clock_started_at'>): boolean {
  return !!t.clock_started_at && t.clock_started_at !== t.requested_at;
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
