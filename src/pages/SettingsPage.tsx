import { useEffect, useState } from 'react';
import { useApp } from '../lib/app';
import { disablePush, enablePush, getPushState, sendTestPush, type PushState } from '../lib/push';
import { friendlyError, supabase } from '../lib/supabase';
import { navigate } from '../lib/router';
import { Button, Card, useToast } from '../components/ui';

const PUSH_TEXT: Record<PushState, string> = {
  on: 'مفعّلة على هذا الجهاز ✅',
  off: 'مطفية على هذا الجهاز',
  denied: 'مرفوضة من إعدادات الجوال. افتح الإعدادات ← الإشعارات ← Toly’s Tasks وفعّلها.',
  'needs-install': 'على الآيفون لازم تضيف التطبيق للشاشة الرئيسية أول.',
  unsupported: 'هذا المتصفح ما يدعم الإشعارات.',
};

export function SettingsPage() {
  const { me } = useApp();
  const toast = useToast();
  const [push, setPush] = useState<PushState | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [pw, setPw] = useState('');

  useEffect(() => {
    getPushState().then(setPush);
  }, []);

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(null);
      setPush(await getPushState());
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <h2 className="font-bold">🔔 الإشعارات</h2>
        <p className="mt-1 text-[15px] text-muted">{push ? PUSH_TEXT[push] : '…'}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {push === 'off' && (
            <Button busy={busy === 'on'} onClick={() => run('on', async () => (await enablePush(), toast('تفعّلت الإشعارات 🔔')))}>
              فعّل الإشعارات
            </Button>
          )}
          {push === 'on' && (
            <>
              <Button
                variant="secondary"
                busy={busy === 'test'}
                onClick={() =>
                  run('test', async () => {
                    const r = await sendTestPush();
                    toast(r.sent ? 'انرسل إشعار تجربة 👌' : 'ما انرسل شي، جرّب تطفي وتشغّل الإشعارات', r.sent ? 'ok' : 'error');
                  })
                }
              >
                جرّب إشعار
              </Button>
              <Button variant="ghost" busy={busy === 'off'} onClick={() => run('off', disablePush)}>
                إيقاف
              </Button>
            </>
          )}
          {push === 'needs-install' && <Button onClick={() => navigate('/ios')}>📲 طريقة التثبيت</Button>}
        </div>
        <ul className="mt-4 space-y-1 text-[13px] text-muted">
          <li>📌 مهمة جديدة لك</li>
          {me.role === 'admin' && <li>✋ «سوّيتها» من بندور للاعتماد</li>}
          <li>✔️ / ❌ إغلاق أو رفض، مع عدد الأيام</li>
          <li>⏰ تذكير يومي 9 الصبح بأقدم مهمة عندك</li>
          <li>🏆 تقرير الجمعة 6 المغرب: مين المقصّر؟</li>
        </ul>
      </Card>

      <Card>
        <h2 className="font-bold">📲 التثبيت على الآيفون</h2>
        <p className="mt-1 text-[15px] text-muted">خطوة وحدة عشان التطبيق يشتغل كأنه تطبيق حقيقي وتوصلك الإشعارات.</p>
        <Button variant="secondary" className="mt-3" onClick={() => navigate('/ios')}>
          اعرض الشرح
        </Button>
      </Card>

      <Card>
        <h2 className="font-bold">🔑 تغيير كلمة المرور</h2>
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            run('pw', async () => {
              const { error } = await supabase.auth.updateUser({ password: pw });
              if (error) throw new Error(/least|short|weak/i.test(error.message) ? 'كلمة المرور قصيرة (8 أحرف على الأقل)' : friendlyError(error.message));
              setPw('');
              toast('تغيّرت كلمة المرور ✅');
            });
          }}
        >
          <input
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            placeholder="كلمة مرور جديدة"
            className="min-w-0 flex-1 rounded-xl border border-line bg-bg px-3 py-2.5 text-[16px] outline-none focus:border-brand"
          />
          <Button type="submit" busy={busy === 'pw'}>
            حفظ
          </Button>
        </form>
      </Card>

      <Card>
        <div className="flex items-center justify-between">
          <p>
            داخل باسم <span className="font-bold">{me.display_name}</span>
          </p>
          <Button
            variant="danger"
            busy={busy === 'out'}
            onClick={() =>
              run('out', async () => {
                await disablePush().catch(() => {});
                await supabase.auth.signOut();
              })
            }
          >
            خروج
          </Button>
        </div>
      </Card>
    </div>
  );
}
