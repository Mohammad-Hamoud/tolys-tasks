# CLAUDE.md — Toly's Tasks

App display name: **Toly's Tasks**. Repo: `tolys-tasks`. Live: https://tolys-tasks.netlify.app (Netlify auto-deploys `main`). Supabase project ref: `cridxqxsyggxogwoawzc`. The full product spec, in Arabic, is in [`SPEC.md`](./SPEC.md). Treat it as the source of truth and read it before making changes.

## What it is
A small Arabic PWA (right-to-left) for shared household tasks between exactly two users:
- **محمد (Mohammad)**: admin
- **الزوجة (the wife)**: regular user

Either user can add a task, and the task is assigned to the other person automatically. The app counts how many days each task stays open. It shows playful "shame" levels, stats and charts, and sends Web Push notifications.

## Tech stack
- **Frontend:** Vite + React + TypeScript, built as a PWA (manifest + service worker via `vite-plugin-pwa`)
- **Styling:** Tailwind CSS. The root has `dir="rtl"` and `lang="ar"`. Use logical properties (`ms-`/`me-`, `ps-`/`pe-`, `start`/`end`), not left/right.
- **Font:** Dubai Font, loaded with `@font-face` from `public/fonts/Dubai-Regular.otf`. It is the only UI font. Fall back to `system-ui, sans-serif`.
- **Charts:** plain HTML/CSS bars (only two bars — no chart library needed)
- **Backend:** Supabase (Postgres + Auth + RLS + Edge Functions + `pg_cron`)
- **Push:** Web Push (VAPID) sent from Supabase Edge Functions
- **Hosting:** Netlify (static build, SPA redirect)

## Non-negotiable rules
1. **Arabic RTL first.** Every screen, label, date and number is designed for Arabic RTL. User-facing text is in Arabic. Code, identifiers and comments are in English.
2. **Permissions live in Supabase RLS, not the UI.** Hiding a button is only a convenience. Every rule below must be enforced in the database through RLS policies, `SECURITY DEFINER` RPCs or triggers, so a crafted API call cannot get around it.
   - Both users: may insert tasks. The assignee is always set server-side to the *other* user, and the client cannot override it.
   - Mohammad only: close (`تم ✔️`), soft-delete, reject a completion request.
   - Wife: may only mark *her own* open tasks as `سوّيتها ✋` → status `pending_confirmation`.
   - Mohammad closes his own tasks directly (no confirmation step).
   - `requested_at` can be set only on insert. It is immutable afterwards.
   - Either person: "أحتاج توضيح ❓" (`request_info`) on an open task assigned to them → status `needs_info`; only the requester answers (`provide_info`).
3. **Nothing is ever hard-deleted.** Deletion is a soft archive (`archived_at`, `archived_by`), and every state change is written to an append-only `task_events` log. Revoke `DELETE` on all tables.
4. **Day counter semantics** (see SPEC.md "العداد"):
   - days = `requested_at` → completion moment (or now, if open)
   - wife's tasks: completion moment = `done_claimed_at`, and it counts only after Mohammad approves
   - rejection clears `done_claimed_at`, and counting continues from `requested_at`
   - shame level = `floor(days / 5)`
   - the assignee's clock starts at `clock_started_at` (= `requested_at` + every day spent waiting for info), so info requests FREEZE it, never reset it
   - `needs_info`: the ball (`task_holder`) is with the requester and days count from `info_requested_at` against them; the assignee's count is frozen. Any number of rounds is allowed
   - "📅 تاريخ معدّل" tag shows when `requested_at::date <> created_at::date`
5. **No deadlines, no priorities.** Do not add them.
6. Only two users exist. Do not build sign-up flows, teams or roles beyond these two.

## Build phases (all shipped)
0. Repo scaffold, tooling, RTL + Dubai font shell, Netlify deploy
1. Supabase schema, RLS, RPCs, audit log, plus RLS tests
2. Auth (two users) + task list + add task
3. Task lifecycle actions (done / سوّيتها / approve / reject / archive)
4. Day counter + shame levels + "تاريخ معدّل" tag
5. Stats & charts + wall of shame + roast messages
6. PWA install + iOS guide page
7. Web Push: subscriptions + event notifications
8. Scheduled push: daily reminder + Friday report
9. Polish, accessibility, QA, release

## Layout
- `src/` — React app. `src/lib/supabase.ts` holds the only write path (RPC calls).
- `src/sw.ts` — service worker: precache + push + notification click.
- `supabase/migrations/` — schema, RLS, RPCs, triggers, cron. The single source of permission truth.
- `supabase/functions/notify/` — Edge Function that sends every Web Push (events, daily, Friday, test).
- `supabase/functions/_shared/` — day counter, shame levels, roast lines. Imported by BOTH the app (`@shared/*`) and the Edge Function, so keep it dependency-free and Deno-compatible (`.ts` imports).
- `supabase/tests/rls_test.sql` — permission tests (run in the SQL editor; rolls back).
- `tests/` — Vitest unit tests for the shared logic and stats.

## How things connect
- Every `task_events` insert fires `private.on_task_event` → `pg_net` POST to the `notify` function with `x-webhook-secret`.
- `pg_cron`: `tolys-daily-reminder` 06:00 UTC (09:00 Riyadh), `tolys-friday-report` Fri 15:00 UTC (18:00 Riyadh).
- Secrets (VAPID private key, webhook secret) live in `private.config`, readable only by `service_role` via `get_service_config()`. Never commit them.
- Sign-ups are blocked by a trigger on `auth.users` (allow-list in `private.allowed_emails`). The two accounts use internal emails `mohammad@example.com` / `bandoor@example.com`; the login screen picks the person.
- Public config (Supabase URL, publishable key, VAPID public key) is committed in `src/lib/config.ts`; `VITE_*` env vars override it.

## Conventions
- Keep schema changes in `supabase/migrations/` as SQL. Never change the DB by hand without a migration.
- Every RLS rule gets a test in `supabase/tests/rls_test.sql` (allowed and denied path).
- Day boundaries and the Friday report use `Asia/Riyadh`.
- Before pushing: `npm test` and `npm run build` (includes typecheck).
