# 🎞 Benteen Screen On The Green (BSOTG)

Movie-night voting. A group signs in with Google, browses upcoming movie-night
**events**, searches TMDB to **suggest** a film, and **votes** on the lineup —
the crowd favorite plays at the next screening. _It Really Whips the Movie's Ass._

## Stack

- **[Nuxt 4](https://nuxt.com)** (Vue 3, `<script setup>`, TypeScript) — SPA (`ssr: false`)
- **[Nuxt UI 4](https://ui.nuxt.com)** (Tailwind CSS v4 + Reka UI) — components & theming
- **[Firebase](https://firebase.google.com)** — Auth (Google) + Cloud Firestore
- **[VueFire](https://vuefire.vuejs.org)** — realtime `useCollection` / `useCurrentUser`
- **[TMDB](https://www.themoviedb.org)** — movie data, proxied server-side (key never hits the browser)
- **[Vitest](https://vitest.dev)** — unit tests

> Migrated from a legacy Nuxt 2 / Vue 2 / Buefy / Firebase 8 codebase. See
> [`CLAUDE.md`](./CLAUDE.md) for architecture, product invariants, and code standards.

## Setup

1. Create a Firebase project; enable **Google Authentication** and **Cloud Firestore**.
2. Get a [TMDB API key](https://www.themoviedb.org/settings/api).
3. Copy env and fill in your values:
   ```bash
   cp .env.example .env
   ```
   - `NUXT_PUBLIC_FIREBASE_*` — Firebase web config (public by design; protected by Security Rules)
   - `NUXT_TMDB_API_KEY` — **server-only**, never exposed to the browser
4. Grant yourself admin (Firestore console): create `roles/{your-uid}` with `{ role: "admin" }`.

## Develop

> Requires **Node 22+** (`.nvmrc` pins 22). The modern toolchain — notably the
> ESLint flat config — needs Node 21+; dev/build/test will run on Node 20 but
> `npm run lint` will not.

```bash
npm install          # install deps (runs `nuxt prepare`)
npm run dev          # dev server → http://localhost:3000
npm run typecheck    # vue-tsc type check
npm run lint         # eslint
npm test             # vitest
npm run build        # production build (Nitro server + SPA)
```

## Deploy

### Vercel (recommended)

Zero-config: import the repo in Vercel and it auto-detects Nuxt, runs `nuxt build`,
and Nitro's Vercel preset ships the static SPA plus serverless functions for the
`/api/*` routes (the TMDB proxy). No `vercel.json` needed.

Set the env vars under **Project → Settings → Environment Variables** — the same
`NUXT_*` keys as `.env.example`: the public `NUXT_PUBLIC_FIREBASE_*` config and the
server-only `NUXT_TMDB_API_KEY`. (Node 22 is picked up from `engines` in package.json.)

### Firebase (rules & indexes)

```bash
firebase deploy --only firestore:rules,firestore:indexes
```

`firestore.rules` is the **authorization source of truth** (route middleware is
UX only). `firestore.indexes.json` includes the composite index the suggestions
query needs.

## Project layout

See [`CLAUDE.md`](./CLAUDE.md) for the full map. In short: `app/` holds the Vue
app (pages, components, composables, layouts, middleware), `server/api/` holds the
TMDB proxy, and `shared/types/` holds the data-model types used by both.
