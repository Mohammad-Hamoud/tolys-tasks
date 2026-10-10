# Toly's Tasks

Arabic (RTL) PWA for shared household tasks between محمد and بندور, with a day counter, shame levels, stats and Web Push. Hosted on Netlify, backed by Supabase.

- Product spec: [`SPEC.md`](./SPEC.md)
- Architecture, rules and conventions: [`CLAUDE.md`](./CLAUDE.md)

```bash
npm install
npm run dev      # local dev server
npm test         # unit tests
npm run build    # typecheck + production build (dist/)
```

Netlify builds with `npm run build` and publishes `dist/` (see `netlify.toml`). No env vars are required.
