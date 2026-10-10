import { describe, expect, it } from 'vitest';
import { daysBetween, daysLabel, isBackdated, riyadhDate, taskDays } from '../supabase/functions/_shared/days.ts';
import { shameLevel, shameText } from '../supabase/functions/_shared/shame.ts';
import { roast } from '../supabase/functions/_shared/roasts.ts';
import { computeStats } from '../src/lib/stats.ts';
import type { Profile, Task } from '../src/lib/types.ts';

const base = { completed_at: null, done_claimed_at: null };

describe('days', () => {
  it('uses Riyadh calendar days', () => {
    // 22:30 UTC on Oct 10 is already Oct 11 in Riyadh (UTC+3).
    expect(riyadhDate('2026-10-10T22:30:00Z')).toBe('2026-10-11');
    expect(daysBetween('2026-09-30', '2026-10-10')).toBe(10);
  });

  it('counts from the request date until now when open', () => {
    const now = new Date('2026-10-10T09:00:00Z');
    expect(taskDays({ ...base, requested_at: '2026-10-03', created_at: '2026-10-10T08:00:00Z' }, now)).toBe(7);
  });

  it('freezes at the claim moment while pending, and at completion when done', () => {
    const now = new Date('2026-10-20T09:00:00Z');
    const t = { requested_at: '2026-10-01', created_at: '2026-10-01T08:00:00Z' };
    expect(taskDays({ ...t, done_claimed_at: '2026-10-04T10:00:00Z', completed_at: null }, now)).toBe(3);
    expect(taskDays({ ...t, done_claimed_at: '2026-10-04T10:00:00Z', completed_at: '2026-10-04T10:00:00Z' }, now)).toBe(3);
    // Rejected → claim cleared → keeps counting from the request date.
    expect(taskDays({ ...t, ...base }, now)).toBe(19);
  });

  it('flags back-dated tasks', () => {
    expect(isBackdated({ requested_at: '2026-10-08', created_at: '2026-10-10T08:00:00Z' })).toBe(true);
    expect(isBackdated({ requested_at: '2026-10-10', created_at: '2026-10-10T08:00:00Z' })).toBe(false);
  });

  it('formats Arabic day counts', () => {
    expect(daysLabel(1)).toBe('يوم واحد');
    expect(daysLabel(2)).toBe('يومين');
    expect(daysLabel(5)).toBe('5 أيام');
    expect(daysLabel(14)).toBe('14 يوم');
  });
});

describe('shame levels', () => {
  it.each([
    [0, '✅ في الوقت'],
    [4, '✅ في الوقت'],
    [5, '🧀 بدأت تتعفن'],
    [10, '🕸️ عنكبوت سكن فيها'],
    [15, '🏺 مهمة أثرية'],
    [20, '🏛️ تراث وطني'],
    [25, '📜 تحت حماية اليونسكو'],
    [30, '👴 يتناقلها الأحفاد'],
    [35, '⚰️ رحمها الله'],
    [39, '⚰️ رحمها الله'],
    [40, '⚰️💀 رحمها الله'],
    [52, '⚰️💀💀💀 رحمها الله'],
  ])('%i days → %s', (days, text) => {
    expect(shameText(days)).toBe(text);
  });

  it('caps the level at 7', () => {
    expect(shameLevel(500).level).toBe(7);
  });
});

describe('roasts', () => {
  const mo = { name: 'محمد', female: false };
  const ba = { name: 'بندور', female: true };

  it('uses the right gender for the loser', () => {
    expect(roast(ba, mo, 1, 0)).toContain('بندور متأخرة');
    expect(roast(mo, ba, 1, 0)).toContain('محمد متأخر ');
  });

  it('gets harsher as the gap grows', () => {
    expect(roast(mo, ba, 0.2, 0)).toContain('تعادل');
    expect(roast(mo, ba, 12, 0)).toContain('إيجار');
  });
});

describe('stats', () => {
  const profiles: Profile[] = [
    { id: 'm', display_name: 'محمد', role: 'admin' },
    { id: 'b', display_name: 'بندور', role: 'member' },
  ];
  const now = new Date('2026-10-10T09:00:00Z');
  const task = (over: Partial<Task>): Task => ({
    id: Math.random(),
    title: 't',
    created_by: 'm',
    assignee: 'b',
    requested_at: '2026-10-01',
    created_at: '2026-10-01T08:00:00Z',
    status: 'open',
    done_claimed_at: null,
    completed_at: null,
    closed_by: null,
    archived_at: null,
    archived_by: null,
    archive_reason: null,
    ...over,
  });

  it('averages closing days, finds the slower one, and ignores archived tasks', () => {
    const tasks = [
      task({ assignee: 'b', status: 'done', completed_at: '2026-10-07T08:00:00Z' }), // 6 days
      task({ assignee: 'b', status: 'done', completed_at: '2026-10-09T08:00:00Z' }), // 8 days
      task({ assignee: 'm', created_by: 'b', status: 'done', completed_at: '2026-10-03T08:00:00Z' }), // 2 days
      task({ assignee: 'm', created_by: 'b', status: 'done', completed_at: '2026-10-10T08:00:00Z', archived_at: 'x', archived_by: 'm' }),
      task({ assignee: 'm', created_by: 'b', requested_at: '2026-09-01' }), // open, 39 days
    ];
    const s = computeStats(tasks, profiles, now);
    expect(s.people.find((p) => p.profile.id === 'b')!.avgClose).toBe(7);
    expect(s.people.find((p) => p.profile.id === 'm')!.avgClose).toBe(2);
    expect(s.slower!.profile.id).toBe('b');
    expect(s.gap).toBe(5);
    expect(s.wall[0].days).toBe(39);
    expect(s.people.find((p) => p.profile.id === 'm')!.open).toBe(1);
  });
});
