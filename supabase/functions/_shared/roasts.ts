// Roast lines: harsh, funny, and picked by how big the gap is. Shared by the stats page and
// the Friday report. Arabic verbs are gendered, so every line takes the people as objects.

export interface Person {
  name: string;
  female: boolean;
}

interface Ctx {
  loser: Person;
  winner: Person;
  gap: string;
}

type Line = (c: Ctx) => string;

/** Pick the masculine or feminine form for a person. */
const g = (p: Person, m: string, f: string) => (p.female ? f : m);

const TIE: Line[] = [
  () => 'تعادل… يعني الاثنين كسالى بنفس الدرجة. مبروك، فريق متناغم في الفشل 🤝',
  () => 'لا فايز ولا خسران، الخسران الوحيد هو البيت 🏚️',
  () => 'نفس المستوى بالضبط. واضح إنكم متفقين على التأجيل من تحت الطاولة 🤫',
];

const SMALL: Line[] = [
  ({ loser }) => `${loser.name} ${g(loser, 'متأخر', 'متأخرة')} بفارق بسيط… بسيط مثل ${g(loser, 'أعذاره', 'أعذارها')} 🙄`,
  ({ loser, winner }) => `${winner.name} ${g(winner, 'متقدم', 'متقدمة')} بشعرة، و${loser.name} ${g(loser, 'ماسك', 'ماسكة')} الشعرة ${g(loser, 'ويتعلق', 'وتتعلق')} فيها 🪢`,
  ({ loser, gap }) => `${gap} يوم فرق بس… يا ${loser.name} حتى في الخسارة ${g(loser, 'متكاسل', 'متكاسلة')} 😴`,
];

const MEDIUM: Line[] = [
  ({ loser }) => `يا ${loser.name}، يا ليت سرعتك في المهام مثل سرعتك في فتح الجوال 📱`,
  ({ loser, gap }) => `${gap} يوم فرق! ${loser.name}، حتى السلحفاة 🐢 طلبت نقل لفريق ثاني`,
  ({ loser }) => `المهام عند ${loser.name} ما تخلص… تتقاعد وتاخذ مكافأة نهاية خدمة 🧓`,
];

const BIG: Line[] = [
  ({ loser }) => `المهمة لما توصل لـ${loser.name} أول شي تكتب وصيتها ⚰️`,
  ({ loser, gap }) => `فارق ${gap} يوم… ${loser.name} ${g(loser, 'صار', 'صارت')} رمز وطني للتأجيل 🏆`,
  ({ loser, winner }) => `${winner.name} ${g(winner, 'يخلص ويمشي', 'تخلص وتمشي')}، و${loser.name} للحين ${g(loser, 'يدوّر', 'تدوّر')} على الشاحن 🔌`,
];

const HUGE: Line[] = [
  ({ loser }) => `المهام عند ${loser.name} صارت تدفع إيجار وتسجل في العنوان الوطني 🏠`,
  ({ loser, gap }) => `${gap} يوم؟! حتى المعاملات الحكومية أسرع منك يا ${loser.name} 🏛️`,
  ({ loser }) => `لو التأجيل رياضة أولمبية، ${loser.name} ${g(loser, 'جاب', 'جابت')} الذهب و${g(loser, 'كسر', 'كسرت')} الرقم و${g(loser, 'نام', 'نامت')} عليه 🥇`,
  ({ loser }) => `${loser.name}، المهام اللي عندك شافت ثلاث مواسم وعيدين ومازالت تنتظر 🎆`,
];

/**
 * A roast for the current gap in average closing days.
 * `seed` rotates lines within a bracket (e.g. the day number) so it changes over time.
 */
export function roast(loser: Person, winner: Person, gapDays: number, seed = 0): string {
  const gap = Math.abs(gapDays);
  const bucket = gap < 0.5 ? TIE : gap < 2 ? SMALL : gap < 5 ? MEDIUM : gap < 10 ? BIG : HUGE;
  const line = bucket[Math.abs(Math.floor(seed)) % bucket.length];
  return line({ loser, winner, gap: gap.toFixed(gap < 10 ? 1 : 0).replace(/\.0$/, '') });
}
