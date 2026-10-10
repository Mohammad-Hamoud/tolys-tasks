import { TIME_ZONE } from '@shared/days.ts';

const dateFmt = new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', {
  timeZone: TIME_ZONE,
  day: 'numeric',
  month: 'long',
});
const dateYearFmt = new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', {
  timeZone: TIME_ZONE,
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});
const timeFmt = new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', {
  timeZone: TIME_ZONE,
  hour: 'numeric',
  minute: '2-digit',
});

/** A YYYY-MM-DD date as "3 أكتوبر" (year added when it isn't this year). */
export function fmtDay(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  return d.getUTCFullYear() === new Date().getUTCFullYear() ? dateFmt.format(d) : dateYearFmt.format(d);
}

/** A timestamp as "3 أكتوبر، 9:15 م". */
export function fmtMoment(iso: string): string {
  const d = new Date(iso);
  return `${dateFmt.format(d)}، ${timeFmt.format(d)}`;
}

export function pct(n: number): string {
  return `${Math.round(n * 100)}٪`;
}
