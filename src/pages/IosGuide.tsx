import { Card } from '../components/ui';
import { isIOS, isStandalone } from '../lib/push';

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" className="inline size-6 align-[-5px] text-[#007aff]" fill="none" stroke="currentColor" strokeWidth="1.8" aria-label="زر المشاركة">
      <path d="M12 3v12M8 7l4-4 4 4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7 10H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2h-1" strokeLinecap="round" />
    </svg>
  );
}

function AddIcon() {
  return (
    <svg viewBox="0 0 24 24" className="inline size-6 align-[-5px]" fill="none" stroke="currentColor" strokeWidth="1.8" aria-label="إضافة">
      <rect x="3.5" y="3.5" width="17" height="17" rx="4" />
      <path d="M12 8v8M8 12h8" strokeLinecap="round" />
    </svg>
  );
}

const steps = [
  { n: 1, body: <>افتح الرابط في <b>Safari</b> (مو من داخل واتساب أو إنستقرام).</> },
  { n: 2, body: <>اضغط زر المشاركة <ShareIcon /> تحت الشاشة (أو فوق في الآيباد).</> },
  { n: 3, body: <>انزل واختر <b>«إضافة إلى الشاشة الرئيسية»</b> <AddIcon />. إذا ما لقيتها اضغط «تعديل الإجراءات» وفعّلها.</> },
  { n: 4, body: <>إذا ظهر خيار <b>«فتح كتطبيق ويب»</b> خلّه مفعّل، واضغط <b>«إضافة»</b>.</> },
  { n: 5, body: <>افتح <b>Toly’s Tasks</b> من الأيقونة الجديدة وسجّل دخول.</> },
  { n: 6, body: <>روح <b>الإعدادات ⚙️</b> في التطبيق واضغط <b>«فعّل الإشعارات»</b> ثم «سماح».</> },
];

export function IosGuide() {
  const installed = isStandalone();
  return (
    <div className="space-y-4">
      <Card>
        <h2 className="text-xl font-bold">📲 تثبيت التطبيق على الآيفون</h2>
        <p className="mt-1 text-[15px] text-muted">
          آبل ما ترسل إشعارات لمواقع الويب إلا إذا انضافت للشاشة الرئيسية، ويلزم <b>iOS 16.4 أو أحدث</b>
          {' '}(الإعدادات ← عام ← حول ← إصدار iOS).
        </p>
        {installed && <p className="mt-3 rounded-2xl bg-ok-soft p-3 font-bold text-ok">✅ التطبيق مثبّت. باقي بس تفعّل الإشعارات من الإعدادات.</p>}
        {!installed && !isIOS() && (
          <p className="mt-3 rounded-2xl bg-surface-2 p-3 text-[14px] text-muted">
            على أندرويد: من قائمة كروم ⋮ اختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية».
          </p>
        )}
      </Card>
      <ol className="space-y-2">
        {steps.map((s) => (
          <li key={s.n} className="flex gap-3 rounded-3xl bg-surface p-4">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand font-bold text-brand-ink">{s.n}</span>
            <p className="text-[16px] leading-relaxed">{s.body}</p>
          </li>
        ))}
      </ol>
      <Card>
        <h3 className="font-bold">ما وصلت الإشعارات؟</h3>
        <ul className="mt-2 list-disc space-y-1 ps-5 text-[15px] text-muted">
          <li>تأكد إنك فاتح التطبيق من الأيقونة، مو من Safari.</li>
          <li>الإعدادات ← الإشعارات ← Toly’s Tasks ← السماح بالإشعارات.</li>
          <li>وضع «التركيز» أو «عدم الإزعاج» يخفيها.</li>
          <li>جرّب زر «جرّب إشعار» من إعدادات التطبيق.</li>
        </ul>
      </Card>
    </div>
  );
}
