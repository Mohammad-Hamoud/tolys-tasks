import { useMemo } from 'react';
import { daysUnit, riyadhDate } from '@shared/days.ts';
import { roast } from '@shared/roasts.ts';
import { useApp } from '../lib/app';
import { computeStats, type PersonStats } from '../lib/stats';
import { fmtDay, pct } from '../lib/format';
import { navigate } from '../lib/router';
import { Card, Empty, ShameBadge } from '../components/ui';

const fmtAvg = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

export function StatsPage() {
  const { tasks, profiles, name } = useApp();
  const s = useMemo(() => computeStats(tasks, profiles), [tasks, profiles]);
  const seed = Number(riyadhDate().replaceAll('-', ''));
  const person = (p: PersonStats) => ({ name: p.profile.display_name, female: p.profile.role === 'member' });

  const roastLine =
    s.slower && s.faster ? roast(person(s.slower), person(s.faster), s.gap, seed) : 'ما فيه بيانات كافية للإحراج… بعد 😏';
  const max = Math.max(1, ...s.people.map((p) => p.avgClose ?? 0));
  const isSlower = (p: PersonStats) => s.slower?.profile.id === p.profile.id && s.gap >= 0.5;

  return (
    <div className="space-y-4">
      <Card className="bg-ink! text-bg!">
        <p className="text-[13px] font-bold opacity-70">🔥 كلمة اليوم</p>
        <p className="mt-1 text-[19px] leading-relaxed font-bold">{roastLine}</p>
      </Card>

      <Card>
        <h2 className="font-bold">متوسط أيام الإغلاق</h2>
        <p className="text-[13px] text-muted">من تاريخ الطلب حتى لحظة الإنجاز. الأقل أحسن.</p>
        <div className="mt-4 space-y-4">
          {s.people.map((p) => {
            const slow = isSlower(p);
            const w = p.avgClose === null ? 0 : Math.max(4, (p.avgClose / max) * 100);
            return (
              <div key={p.profile.id} title={`${p.profile.display_name}: ${p.avgClose === null ? 'لا يوجد' : fmtAvg(p.avgClose) + ' يوم'} (${p.closed} مهمة)`}>
                <div className="mb-1 flex items-baseline justify-between text-[15px]">
                  <span className={`font-bold ${slow ? 'text-danger' : ''}`}>
                    {p.profile.display_name} {slow && '🐢'}
                  </span>
                  <span className="num text-muted">
                    {p.avgClose === null ? 'ما خلّص شي بعد' : `${fmtAvg(p.avgClose)} ${Number.isInteger(p.avgClose) ? daysUnit(p.avgClose) : 'يوم'}`}
                    <span className="text-[12px]"> · {p.closed} مهمة</span>
                  </span>
                </div>
                <div className="h-7 overflow-hidden rounded-e-md bg-surface-2">
                  <div
                    className={`h-full rounded-e-[4px] transition-[width] duration-500 ${slow ? 'bg-danger' : 'bg-brand'}`}
                    style={{ width: `${w}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        {s.people.map((p) => (
          <Card key={p.profile.id}>
            <p className="text-[14px] font-bold text-muted">{p.profile.display_name}</p>
            <p className="num mt-1 text-3xl font-bold">{p.open}</p>
            <p className="text-[13px] text-muted">مهام مفتوحة</p>
            <div className="my-3 h-px bg-line" />
            <p className="num text-2xl font-bold">{p.rate30 === null ? '—' : pct(p.rate30)}</p>
            <p className="text-[13px] text-muted">
              نسبة الإنجاز آخر 30 يوم
              {p.added30 > 0 && (
                <span className="num">
                  {' '}
                  ({p.done30}/{p.added30})
                </span>
              )}
            </p>
          </Card>
        ))}
      </div>

      <Card>
        <h2 className="font-bold">🧱 حائط العار</h2>
        <p className="text-[13px] text-muted">أقدم 3 مهام ما خلصت</p>
        {s.wall.length === 0 ? (
          <div className="mt-3">
            <Empty emoji="🧼" title="الحائط نظيف" hint="ولا مهمة مفتوحة… مين أنتم؟" />
          </div>
        ) : (
          <ol className="mt-3 space-y-2">
            {s.wall.map(({ task, days }, i) => (
              <li key={task.id}>
                <button
                  onClick={() => navigate(`/task/${task.id}`)}
                  className="flex w-full items-center gap-3 rounded-2xl bg-surface-2 p-3 text-start"
                >
                  <span className="text-2xl" aria-hidden>
                    {['🥇', '🥈', '🥉'][i]}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold">{task.title}</p>
                    <p className="text-[13px] text-muted">
                      على {name(task.assignee)} · من <span className="num">{fmtDay(task.requested_at)}</span>
                    </p>
                    <div className="mt-1">
                      <ShameBadge days={days} />
                    </div>
                  </div>
                  <div className="num shrink-0 text-center">
                    <div className="text-2xl font-bold text-danger">{days}</div>
                    <div className="text-[11px] text-muted">{daysUnit(days)}</div>
                  </div>
                </button>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </div>
  );
}
