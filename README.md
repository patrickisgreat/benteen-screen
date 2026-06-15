# 🎞 Benteen Screen On The Green (BSOTG)

Movie-night voting. A group signs in with Google, browses upcoming movie-night
**events**, searches TMDB to **suggest** a film, and **votes** on the lineup —
the crowd favorite plays at the next screening. _It Really Whips the Movie's Ass._

## Stack

- **[Nuxt 4](https://nuxt.com)** (Vue 3, `<script setup>`, TypeScript) — SPA (`ssr: false`)
- **[Nuxt UI 4](https://ui.nuxt.com)** (Tailwind CSS v4 + Reka UI) — components & theming
- **[Supabase](https://supabase.com)** — Auth (Google), Postgres + RLS, Realtime
  (via [`@nuxtjs/supabase`](https://supabase.nuxtjs.org))
- **[TMDB](https://www.themoviedb.org)** — movie data, proxied server-side (key never hits the browser)
- **[Vitest](https://vitest.dev)** — unit tests

> Migrated from Nuxt 2 / Vue 2 / Buefy, then from Firebase to Supabase. See
> [`CLAUDE.md`](./CLAUDE.md) for architecture, product invariants, and code standards.

## Supabase setup

1. **Create a project** at [supabase.com](https://supabase.com).
2. **Apply the schema** — paste `supabase/migrations/20260615120000_init.sql` into the
   Supabase **SQL Editor** and run it (or `supabase db push` if you use the CLI). It
   creates the tables, RLS policies, triggers, and realtime publication.
3. **Enable Google auth** — Authentication → Providers → Google: add your Google OAuth
   client ID/secret, and add `https://<project-ref>.supabase.co/auth/v1/callback` to the
   authorized redirect URIs in the Google Cloud console. Also add your app's URL(s)
   (e.g. `http://localhost:3000`, your Vercel domain) under Authentication → URL Configuration.
4. **Grant yourself admin** — after you've signed in once, in the SQL Editor:
   ```sql
   update public.profiles set is_admin = true where email = 'you@example.com';
   ```
5. **Keys** — copy env and fill in your values (Settings → API):
   ```bash
   cp .env.example .env
   ```
   - `SUPABASE_URL`, `SUPABASE_KEY` (anon/public key — protected by RLS, not secrecy)
   - `NUXT_SUPABASE_SECRET_KEY` — **server-only** service-role key (account deletion)
   - `NUXT_TMDB_API_KEY` — **server-only** TMDB key

## Develop

> Requires **Node 22+** (`.nvmrc` pins 22) — the ESLint flat config needs Node 21+.

```bash
npm install          # install deps (runs `nuxt prepare`)
npm run dev          # dev server → http://localhost:3000
npm run typecheck    # vue-tsc type check
npm run lint         # eslint
npm test             # vitest
npm run build        # production build (Nitro server + SPA)
```

## Migrating data from Firestore (optional)

A one-time ETL script brings users, events, suggestions, and votes from the old
Firebase project into Supabase. Apply the schema first, then:

```bash
npm install --no-save firebase-admin
export GOOGLE_APPLICATION_CREDENTIALS=/abs/path/to/firebase-service-account.json
export SUPABASE_URL=https://<project-ref>.supabase.co
export SUPABASE_SERVICE_KEY=<service-role key>
node scripts/migrate-firestore-to-supabase.mjs
```

See the script header for caveats (notably: returning users' Google sign-in maps onto
their migrated account by confirmed email).

## Deploy (Vercel)

Zero-config: import the repo in Vercel and it auto-detects Nuxt, runs `nuxt build`, and
Nitro's Vercel preset ships the static SPA plus serverless functions for the `/api/*`
routes (TMDB proxy, account deletion). No `vercel.json` needed.

Set the env vars under **Project → Settings → Environment Variables** — the same keys as
`.env.example` (`SUPABASE_URL`, `SUPABASE_KEY`, `NUXT_SUPABASE_SECRET_KEY`, `NUXT_TMDB_API_KEY`).
Node 22 is picked up from `engines` in `package.json`.

## Project layout

See [`CLAUDE.md`](./CLAUDE.md) for the full map. In short: `app/` holds the Vue app
(pages, components, composables, layouts, middleware, plugins), `server/api/` holds the
server routes, `shared/types/` holds shared types, and `supabase/migrations/` holds the
schema + RLS.
