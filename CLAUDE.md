# CLAUDE.md — Toly's Tasks

App display name: **Toly's Tasks**. Repo: `tolys-tasks`. The full product spec, in Arabic, is in [`SPEC.md`](./SPEC.md). Treat it as the source of truth and read it before making changes.

## What it is
A small Arabic PWA (right-to-left) for shared household tasks between exactly two users:
- **محمد (Mohammad)**: admin
- **الزوجة (the wife)**: regular user

Either user can add a task, and the task is assigned to the other person automatically. The app counts how many days each task stays open. It shows playful "shame" levels, stats and charts, and sends Web Push notifications.

## Tech stack
- **Frontend:** Vite + React + TypeScript, built as a PWA (manifest + service worker via `vite-plugin-pwa`)
- **Styling:** Tailwind CSS. The root has `dir="rtl"` and `lang="ar"`. Use logical properties (`ms-`/`me-`, `ps-`/`pe-`, `start`/`end`), not left/right.
- **Font:** Dubai Font, loaded with `@font-face` from `public/fonts/Dubai-Regular.otf`. It is the only UI font. Fall back to `system-ui, sans-serif`.
- **Charts:** Chart.js (bar chart of average days to close)
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
3. **Nothing is ever hard-deleted.** Deletion is a soft archive (`archived_at`, `archived_by`), and every state change is written to an append-only `task_events` log. Revoke `DELETE` on all tables.
4. **Day counter semantics** (see SPEC.md "العداد"):
   - days = `requested_at` → completion moment (or now, if open)
   - wife's tasks: completion moment = `done_claimed_at`, and it counts only after Mohammad approves
   - rejection clears `done_claimed_at`, and counting continues from `requested_at`
   - shame level = `floor(days / 5)`
   - "📅 تاريخ معدّل" tag shows when `requested_at::date <> created_at::date`
5. **No deadlines, no priorities.** Do not add them.
6. Only two users exist. Do not build sign-up flows, teams or roles beyond these two.

## Build phases
Phases are delivered one at a time. Wait for approval before starting the next.
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

## Conventions
- Keep schema changes in `supabase/migrations/` as SQL. Never change the DB by hand without a migration.
- Every RLS rule gets a test that runs as each user and checks both the allowed and the denied path.
- Day boundaries and the Friday report use the `Asia/Riyadh` timezone (to be confirmed).
