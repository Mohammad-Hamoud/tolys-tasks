import { supabase, friendlyError } from './supabase';
import { SUPABASE_URL, VAPID_PUBLIC_KEY } from './config';

export type PushState = 'unsupported' | 'needs-install' | 'denied' | 'off' | 'on';

export const isIOS = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export async function getPushState(): Promise<PushState> {
  // iOS only allows Web Push from an app added to the Home Screen (iOS 16.4+).
  if (isIOS() && !isStandalone()) return 'needs-install';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return sub && Notification.permission === 'granted' ? 'on' : 'off';
}

async function save(sub: PushSubscription) {
  const j = sub.toJSON();
  const { error } = await supabase.rpc('save_push_subscription', {
    p_endpoint: j.endpoint,
    p_p256dh: j.keys?.p256dh,
    p_auth: j.keys?.auth,
    p_user_agent: navigator.userAgent,
  });
  if (error) throw new Error(friendlyError(error.message));
}

/** Must be called from a tap (iOS requires a user gesture). */
export async function enablePush(): Promise<void> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('ما سمحت بالإشعارات. فعّلها من إعدادات الجوال.');
  const reg = await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) }));
  await save(sub);
}

export async function disablePush(): Promise<void> {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await supabase.rpc('delete_push_subscription', { p_endpoint: sub.endpoint });
  await sub.unsubscribe();
}

/** After sign-in, make sure this device's subscription belongs to the signed-in person. */
export async function resyncPush(): Promise<void> {
  try {
    if ((await getPushState()) !== 'on') return;
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (sub) await save(sub);
  } catch {
    /* best effort */
  }
}

export async function sendTestPush(): Promise<{ sent: number; subscriptions: number }> {
  const { data } = await supabase.auth.getSession();
  const res = await fetch(`${SUPABASE_URL}/functions/v1/notify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token}` },
    body: JSON.stringify({ type: 'test' }),
  });
  if (!res.ok) throw new Error('تعذّر إرسال إشعار التجربة');
  return res.json();
}
