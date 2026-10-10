import { useState } from 'react';
import { ACCOUNTS } from '../lib/config';
import { friendlyError, supabase } from '../lib/supabase';
import { Button } from '../components/ui';

export function LoginPage() {
  const [who, setWho] = useState<(typeof ACCOUNTS)[number] | null>(null);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!who) return;
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email: who.email, password });
    if (error) setError(friendlyError(error.message));
    setBusy(false);
  }

  return (
    <main className="pt-safe pb-safe mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5">
      <div className="mb-8 text-center">
        <img src="/icons/icon-192.png" alt="" className="mx-auto size-20 rounded-[22px] shadow-lg" />
        <h1 className="mt-4 text-3xl font-bold" dir="ltr">
          Toly's Tasks
        </h1>
        <p className="mt-1 text-muted">مهام البيت… مع عداد العار 🐢</p>
      </div>

      <p className="mb-3 text-center font-bold">مين أنت؟</p>
      <div className="grid grid-cols-2 gap-3">
        {ACCOUNTS.map((a) => (
          <button
            key={a.email}
            onClick={() => {
              setWho(a);
              setError(null);
            }}
            aria-pressed={who?.email === a.email}
            className={`rounded-3xl border-2 bg-surface p-4 transition active:scale-95 ${
              who?.email === a.email ? 'border-brand' : 'border-transparent'
            }`}
          >
            <div className="text-5xl" aria-hidden>
              {a.avatar}
            </div>
            <div className="mt-2 text-lg font-bold">{a.name}</div>
          </button>
        ))}
      </div>

      {who && (
        <form onSubmit={submit} className="animate-fade mt-5 space-y-3">
          <input
            type="password"
            autoComplete="current-password"
            autoFocus
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={`كلمة مرور ${who.name}`}
            className="w-full rounded-xl border border-line bg-surface px-4 py-3.5 text-[17px] outline-none focus:border-brand"
            dir="ltr"
          />
          {/* Lets password managers save the right account. */}
          <input type="email" name="email" autoComplete="username" value={who.email} readOnly hidden />
          {error && <p className="text-center font-bold text-danger">{error}</p>}
          <Button type="submit" className="w-full" busy={busy}>
            دخول
          </Button>
        </form>
      )}
    </main>
  );
}
