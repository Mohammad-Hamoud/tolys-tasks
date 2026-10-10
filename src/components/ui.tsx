import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { shameLevel } from '@shared/shame.ts';

// --- Buttons -------------------------------------------------------------------
type Variant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'ok' | 'warn';
const variants: Record<Variant, string> = {
  primary: 'bg-brand text-brand-ink',
  ok: 'bg-ok text-white dark:text-[#0d1f14]',
  warn: 'bg-warn text-white dark:text-[#2a1d05]',
  danger: 'bg-danger-soft text-danger',
  secondary: 'bg-surface-2 text-ink',
  ghost: 'text-muted',
};

export function Button({
  variant = 'primary',
  busy,
  className = '',
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; busy?: boolean }) {
  return (
    <button
      {...rest}
      disabled={rest.disabled || busy}
      className={`inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-4 text-[15px] font-bold transition active:scale-[0.97] disabled:opacity-50 ${variants[variant]} ${className}`}
    >
      {busy ? <span className="inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : children}
    </button>
  );
}

// --- Bottom sheet --------------------------------------------------------------
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true" aria-label={title}>
      <div className="animate-fade absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="animate-sheet pb-safe relative max-h-[90dvh] w-full max-w-xl overflow-y-auto rounded-t-3xl bg-surface px-4 pt-3 shadow-2xl">
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-line" />
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">{title}</h2>
          <button onClick={onClose} className="grid size-9 place-items-center rounded-full bg-surface-2 text-muted" aria-label="إغلاق">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// --- Toasts --------------------------------------------------------------------
type Toast = { id: number; text: string; tone: 'ok' | 'error' };
const ToastCtx = createContext<(text: string, tone?: Toast['tone']) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(1);
  const push = useCallback((text: string, tone: Toast['tone'] = 'ok') => {
    const id = next.current++;
    setToasts((t) => [...t, { id, text, tone }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex flex-col items-center gap-2 px-4 pt-safe" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`animate-fade max-w-md rounded-2xl px-4 py-2.5 text-[15px] font-bold shadow-lg ${
              t.tone === 'error' ? 'bg-danger text-white dark:text-[#2b0d0b]' : 'bg-ink text-bg'
            }`}
          >
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

// --- Shame badge ---------------------------------------------------------------
// One tint per level, getting angrier every 5 days.
const levelTone = [
  'bg-ok-soft text-ok',
  'bg-[#fff4c2] text-[#7a5c00] dark:bg-[#3a3210] dark:text-[#f2d66b]',
  'bg-warn-soft text-warn',
  'bg-[#ffe2cc] text-[#a3420a] dark:bg-[#43261a] dark:text-[#ffa66e]',
  'bg-[#ffd9d4] text-[#b02a1c] dark:bg-[#4a1f1b] dark:text-[#ff8a7c]',
  'bg-danger-soft text-danger',
  'bg-danger text-white dark:text-[#2b0d0b]',
  'bg-ink text-bg',
];

export function ShameBadge({ days, compact }: { days: number; compact?: boolean }) {
  const s = shameLevel(days);
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[13px] font-bold whitespace-nowrap ${levelTone[s.level]}`}>
      <span aria-hidden>
        {s.emoji}
        {'💀'.repeat(s.skulls)}
      </span>
      {!compact && s.label}
    </span>
  );
}

export function Empty({ emoji, title, hint }: { emoji: string; title: string; hint?: string }) {
  return (
    <div className="rounded-3xl border border-dashed border-line px-6 py-10 text-center">
      <div className="text-5xl" aria-hidden>
        {emoji}
      </div>
      <p className="mt-3 text-lg font-bold">{title}</p>
      {hint && <p className="mt-1 text-[15px] text-muted">{hint}</p>}
    </div>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-3xl bg-surface p-4 shadow-[0_1px_0_var(--line)] ${className}`}>{children}</section>;
}
