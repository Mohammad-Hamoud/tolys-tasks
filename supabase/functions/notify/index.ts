// "notify" Edge Function: sends every Web Push notification.
//
// Called by:
//   - the database (pg_net), on every task event and on the daily/Friday schedules.
//     Authenticated with the x-webhook-secret header (stored in private.config).
//   - the app, for a "test" notification to the signed-in user (Authorization: Bearer <user JWT>).
import { createClient } from 'npm:@supabase/supabase-js@2.117.3';
import webpush from 'npm:web-push@3.6.7';
import { daysLabel, isBackdated, riyadhDate, taskDays } from '../_shared/days.ts';
import { shameText } from '../_shared/shame.ts';
import { roast, type Person } from '../_shared/roasts.ts';

interface Profile {
  id: string;
  display_name: string;
  role: 'admin' | 'member';
}
interface Task {
  id: number;
  title: string;
  created_by: string;
  assignee: string;
  requested_at: string;
  created_at: string;
  status: 'open' | 'pending' | 'done';
  done_claimed_at: string | null;
  completed_at: string | null;
  archived_at: string | null;
}
interface Payload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

let config: Record<string, string> | null = null;
async function getConfig(): Promise<Record<string, string>> {
  if (!config) {
    const { data, error } = await sb.rpc('get_service_config');
    if (error) throw error;
    config = data as Record<string, string>;
    webpush.setVapidDetails(config.vapid_subject ?? 'https://tolys-tasks.netlify.app', config.vapid_public, config.vapid_private);
  }
  return config;
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const person = (p: Profile): Person => ({ name: p.display_name, female: p.role === 'member' });
const g = (p: Profile, m: string, f: string) => (p.role === 'member' ? f : m);

async function loadProfiles() {
  const { data, error } = await sb.from('profiles').select('id, display_name, role');
  if (error) throw error;
  const list = data as Profile[];
  const byId = new Map(list.map((p) => [p.id, p]));
  return { list, byId, admin: list.find((p) => p.role === 'admin')! };
}

async function sendTo(userIds: string[], payload: Payload) {
  const { data: subs, error } = await sb.from('push_subscriptions').select('*').in('user_id', userIds);
  if (error) throw error;
  const results = await Promise.allSettled(
    (subs ?? []).map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(payload),
          { TTL: 60 * 60 * 24, urgency: 'high' },
        );
        return 'sent';
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        // The browser dropped this subscription: forget it.
        if (code === 404 || code === 410) await sb.from('push_subscriptions').delete().eq('id', s.id);
        throw e;
      }
    }),
  );
  const sent = results.filter((r) => r.status === 'fulfilled').length;
  const failed = results.flatMap((r) => (r.status === 'rejected' ? [String((r.reason as Error)?.message ?? r.reason)] : []));
  return { subscriptions: subs?.length ?? 0, sent, failed };
}

// --- Task events -------------------------------------------------------------
async function handleEvent(eventId: number) {
  const { data: ev, error } = await sb.from('task_events').select('*').eq('id', eventId).single();
  if (error) throw error;
  const { data: task, error: tErr } = await sb.from('tasks').select('*').eq('id', ev.task_id).single();
  if (tErr) throw tErr;
  const t = task as Task;
  const { byId, admin, list } = await loadProfiles();
  const creator = byId.get(t.created_by)!;
  const assignee = byId.get(t.assignee)!;
  const everyone = list.map((p) => p.id);
  const url = `/#/task/${t.id}`;
  const tag = `task-${t.id}`;

  switch (ev.kind) {
    case 'created':
      return sendTo([t.assignee], {
        title: `📌 مهمة جديدة من ${creator.display_name}`,
        body: t.title + (isBackdated(t) ? ` (📅 تاريخ معدّل: ${daysLabel(ev.days)})` : ''),
        url,
        tag,
      });
    case 'claimed':
      return sendTo([admin.id], {
        title: `✋ ${assignee.display_name} ${g(assignee, 'يقول', 'تقول')}: سوّيتها!`,
        body: `${t.title} — بانتظار اعتمادك`,
        url,
        tag,
      });
    case 'closed':
      return sendTo(everyone, {
        title: '✔️ تمت المهمة',
        body: `${t.title} — ${assignee.display_name} ${g(assignee, 'خلّصها', 'خلّصتها')} بعد ${daysLabel(ev.days)} ${shameText(ev.days)}`,
        url,
        tag,
      });
    case 'rejected':
      return sendTo(everyone, {
        title: '❌ رُفض الإنجاز',
        body: `${t.title} — العداد رجع يشتغل: ${daysLabel(ev.days)}${ev.note ? ` · السبب: ${ev.note}` : ''}`,
        url,
        tag,
      });
    default:
      return { skipped: ev.kind };
  }
}

async function activeTasks(): Promise<Task[]> {
  const { data, error } = await sb.from('tasks').select('*').is('archived_at', null);
  if (error) throw error;
  return data as Task[];
}

// --- Daily reminder: each person's oldest open task ----------------------------
async function handleDaily() {
  const { list, admin } = await loadProfiles();
  const tasks = await activeTasks();
  const out: Record<string, unknown> = {};
  for (const p of list) {
    const mine = tasks
      .filter((t) => t.assignee === p.id && t.status === 'open')
      .sort((a, b) => a.requested_at.localeCompare(b.requested_at) || a.created_at.localeCompare(b.created_at));
    const pendingApprovals = p.id === admin.id ? tasks.filter((t) => t.status === 'pending').length : 0;
    if (!mine.length && !pendingApprovals) continue;

    const lines: string[] = [];
    if (mine.length) {
      const d = taskDays(mine[0]);
      lines.push(`${mine[0].title} — ${daysLabel(d)} ${shameText(d)}`);
      if (mine.length > 1) lines.push(`وعندك ${mine.length - 1} غيرها تنتظر`);
    }
    if (pendingApprovals) lines.push(`✋ ${pendingApprovals} بانتظار اعتمادك`);
    out[p.display_name] = await sendTo([p.id], {
      title: mine.length ? '⏰ أقدم مهمة عندك' : '✋ طلبات بانتظار اعتمادك',
      body: lines.join('\n'),
      url: '/#/',
      tag: 'daily',
    });
  }
  return out;
}

// --- Friday report: the weekly slacker -----------------------------------------
async function handleWeekly() {
  const { list } = await loadProfiles();
  const tasks = await activeTasks();
  const weekAgo = Date.now() - 7 * 86_400_000;

  const stats = list.map((p) => {
    const open = tasks.filter((t) => t.assignee === p.id && t.status !== 'done');
    const closed = tasks.filter((t) => t.assignee === p.id && t.status === 'done' && Date.parse(t.completed_at!) >= weekAgo);
    // Week score: closed this week + still-open tasks at their current age (hoarding doesn't help).
    const counted = [...closed, ...open].map((t) => taskDays(t));
    const avg = counted.length ? counted.reduce((a, b) => a + b, 0) / counted.length : 0;
    return { p, open: open.length, closed: closed.length, avg };
  });
  const [a, b] = stats;
  const sorted = [...stats].sort((x, y) => y.avg - x.avg || y.open - x.open);
  const loser = sorted[0];
  const winner = sorted[1];
  const gap = a.avg - b.avg;
  const seed = Number(riyadhDate().replaceAll('-', ''));

  const line = (s: (typeof stats)[number]) =>
    `${s.p.display_name}: ${g(s.p, 'خلّص', 'خلّصت')} ${s.closed} · مفتوح ${s.open} · متوسط ${s.avg.toFixed(1)} يوم`;

  let headline: string;
  if (!a.open && !b.open && !a.closed && !b.closed) {
    headline = 'أسبوع هادي… ولا مهمة وحدة؟ مشكوك فيه 🤨';
  } else if (Math.abs(gap) < 0.5) {
    headline = `تعادل! ${roast(person(loser.p), person(winner.p), 0, seed)}`;
  } else {
    headline = `المقصّر الأسبوعي: ${loser.p.display_name} 🐢\n${roast(person(loser.p), person(winner.p), gap, seed)}`;
  }

  return sendTo(
    list.map((p) => p.id),
    { title: '🏆 تقرير الجمعة', body: `${headline}\n${line(a)}\n${line(b)}`, url: '/#/stats', tag: 'weekly' },
  );
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json(405, { error: 'method not allowed' });

  try {
    const cfg = await getConfig();
    const body = await req.json().catch(() => ({}));
    const fromDb = req.headers.get('x-webhook-secret') === cfg.webhook_secret;

    if (!fromDb) {
      // Only "test" is open to app users, and only for themselves.
      if (body.type !== 'test') return json(401, { error: 'unauthorized' });
      const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ?? '';
      const { data } = await sb.auth.getUser(token);
      if (!data.user) return json(401, { error: 'unauthorized' });
      const res = await sendTo([data.user.id], {
        title: '🔔 تجربة إشعار',
        body: 'إذا شفت هذا، الإشعارات شغالة 👌',
        url: '/#/settings',
        tag: 'test',
      });
      return json(200, res);
    }

    switch (body.type) {
      case 'event':
        return json(200, await handleEvent(Number(body.event_id)));
      case 'daily':
        return json(200, await handleDaily());
      case 'weekly':
        return json(200, await handleWeekly());
      default:
        return json(400, { error: 'unknown type' });
    }
  } catch (e) {
    console.error(e);
    return json(500, { error: String((e as Error)?.message ?? e) });
  }
});
