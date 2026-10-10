import { useState } from 'react';
import { daysBetween, riyadhDate } from '@shared/days.ts';
import { api } from '../lib/supabase';
import { useApp } from '../lib/app';
import { Button, Sheet, useToast } from './ui';

export function AddTaskSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { other, reload } = useApp();
  const toast = useToast();
  const today = riyadhDate();
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(today);
  const [busy, setBusy] = useState(false);
  const backdated = date !== today;

  function close() {
    setTitle('');
    setDate(riyadhDate());
    onClose();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    try {
      await api.addTask(title.trim(), date === today ? null : date);
      toast(`انرسلت لـ${other.display_name} 📌`);
      await reload();
      close();
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onClose={close} title="مهمة جديدة">
      <form onSubmit={submit} className="space-y-4 pb-2">
        <label className="block">
          <span className="mb-1.5 block text-[14px] font-bold text-muted">وش المطلوب؟</span>
          <input
            autoFocus
            required
            maxLength={200}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="مثلاً: تركيب الستارة"
            className="w-full rounded-xl border border-line bg-bg px-3 py-3 text-[17px] outline-none focus:border-brand"
          />
        </label>

        <div className="flex items-center justify-between rounded-xl bg-surface-2 px-3 py-3">
          <span className="text-[14px] font-bold text-muted">المطلوب منه</span>
          <span className="text-[16px] font-bold">{other.display_name}</span>
        </div>

        <label className="block">
          <span className="mb-1.5 block text-[14px] font-bold text-muted">تاريخ الطلب</span>
          <input
            type="date"
            required
            value={date}
            max={today}
            min={riyadhDate(Date.now() - 365 * 86_400_000)}
            onChange={(e) => setDate(e.target.value || today)}
            className="num w-full rounded-xl border border-line bg-bg px-3 py-3 text-[16px] outline-none focus:border-brand"
          />
          <span className="mt-1.5 block text-[13px] text-muted">
            {backdated
              ? `📅 تاريخ معدّل — العداد يبدأ من ${daysBetween(date, today)} يوم ورا، وما تقدر تغيّره بعد الإضافة.`
              : 'افتراضياً اليوم. تقدر ترجعه لورا الحين بس، وبعد الإضافة ما يتعدّل.'}
          </span>
        </label>

        <Button type="submit" className="w-full" busy={busy} disabled={!title.trim()}>
          أرسلها لـ{other.display_name} 📌
        </Button>
      </form>
    </Sheet>
  );
}
