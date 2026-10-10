// Public configuration. Every value here ships to the browser anyway, so defaults are committed
// and the deploy needs no env vars. Override with VITE_* env vars for another project.

export const SUPABASE_URL: string =
  import.meta.env.VITE_SUPABASE_URL ?? 'https://cridxqxsyggxogwoawzc.supabase.co';

export const SUPABASE_PUBLISHABLE_KEY: string =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? 'sb_publishable_UqqZMLaIJoE4PtWsgCoYqg_qgGQf7LV';

export const VAPID_PUBLIC_KEY: string =
  import.meta.env.VITE_VAPID_PUBLIC_KEY ??
  'BHuORdytoop0ISrB-BpaEpYAgxAN56elyvvXeilYQPsKJU0AmO5GB1YZfSJFYu2VL0F1Xbl14hWMfiXwK-z5G-A';

/** The only two accounts. The login screen picks the person, then asks for the password. */
export const ACCOUNTS = [
  { email: 'mohammad@example.com', name: 'محمد', avatar: '🧔🏻' },
  { email: 'bandoor@example.com', name: 'بندور', avatar: '👩🏻' },
] as const;
