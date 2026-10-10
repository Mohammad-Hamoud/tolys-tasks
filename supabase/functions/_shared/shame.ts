// Shame levels: a new level every 5 days. Shared by the web app and the "notify" Edge Function.

export interface ShameLevel {
  /** 0 … 7 */
  level: number;
  emoji: string;
  label: string;
  /** Extra 💀 for every 5 days past 35. */
  skulls: number;
}

const LEVELS: ReadonlyArray<{ emoji: string; label: string }> = [
  { emoji: '✅', label: 'في الوقت' },
  { emoji: '🧀', label: 'بدأت تتعفن' },
  { emoji: '🕸️', label: 'عنكبوت سكن فيها' },
  { emoji: '🏺', label: 'مهمة أثرية' },
  { emoji: '🏛️', label: 'تراث وطني' },
  { emoji: '📜', label: 'تحت حماية اليونسكو' },
  { emoji: '👴', label: 'يتناقلها الأحفاد' },
  { emoji: '⚰️', label: 'رحمها الله' },
];

export function shameLevel(days: number): ShameLevel {
  const d = Math.max(0, Math.floor(days));
  const level = Math.min(LEVELS.length - 1, Math.floor(d / 5));
  const skulls = d >= 40 ? Math.floor((d - 35) / 5) : 0;
  return { level, ...LEVELS[level], skulls };
}

/** "🕸️ عنكبوت سكن فيها" or "⚰️💀💀 رحمها الله". */
export function shameText(days: number): string {
  const s = shameLevel(days);
  return `${s.emoji}${'💀'.repeat(s.skulls)} ${s.label}`;
}
