# CLAUDE.md — Benteen Screen On The Green (BSOTG)

## What is this project?

BSOTG is a movie-night voting app. A group signs in with Google, browses upcoming
movie-night **events**, searches TMDB to **suggest** a film for an event, and
**votes** on each other's suggestions. **Admins** manage the events (a calendar of
movie nights with rich descriptions) and moderate suggestions. The tagline:
"It Really Whips the Movie's Ass."

> **Status:** Migrated from Nuxt 2 / Vue 2 / Buefy, then from Firebase to Supabase.
> If you find anything still referencing the old stacks (class components,
> `vue-property-decorator`, Buefy `b-*` components, Firebase/Firestore/VueFire,
> `firestore.rules`, `votesCount`/`userReference`/`suggestedItem`), it is a leftover to
> be removed, not a pattern to follow.

## ⚠️ Product Invariants — DO NOT VIOLATE

These are the locked constraints of the system. Treat them as non-negotiable.

1. **Row Level Security (RLS) is the source of truth for authorization.** Route
   middleware (`app/middleware/admin.ts`) and the Supabase module's global auth redirect
   are **UX conveniences only** — they can be bypassed by anyone with the browser console.
   The real enforcement lives in the RLS policies in `supabase/migrations/*.sql`. Every
   new table, column, or access pattern needs a matching policy. Never relax a policy to
   "make a feature work"; tighten the feature instead.

2. **The TMDB API key and the Supabase service-role key are server-only.** They must
   never reach the browser — used only in `server/api/**` (`runtimeConfig.tmdbApiKey`;
   `serverSupabaseServiceRole`). The legacy app shipped the TMDB key to the client — the
   exact regression to never reintroduce. By contrast, the **Supabase anon key**
   (`SUPABASE_KEY`) is public by design — safe in the client, protected by RLS, not secrecy.

3. **Vote integrity is structural.** Votes are normalized rows in `public.votes` with a
   composite PK `(suggestion_id, user_id)` — one vote per user per suggestion is enforced
   by the database, and the count is just `votes.length`. There is no counter to drift
   (the old Firestore `votesCount`/`votes[]` hazard is gone). Per-event vote/suggestion
   limits are enforced server-side by Postgres triggers **and** mirrored in the UI
   (`app/utils/limits.ts`); keep the two in sync.

4. **Admin role is assigned out-of-band, never from the app.** `profiles.is_admin` is
   granted only via SQL / the service role; the RLS update policy on `profiles` forbids a
   user from changing their own `is_admin`. Do not add client code that writes it. Reading
   your own profile to toggle admin UI is fine; the UI is not the gate (see invariant 1).

5. **Stored user-generated HTML must be sanitized before render.** Event descriptions
   are rich text. Never `v-html` stored content without sanitizing it first
   (`app/utils/sanitize.ts`). The legacy app rendered raw admin HTML — an XSS hole.

6. **SPA / client-only auth model (`ssr: false`).** Supabase Auth runs in the browser
   (session in cookies, so server routes can still read it via `serverSupabaseUser`). Do
   not enable SSR for auth-gated pages without verifying the auth/session flow. Nitro
   `/api/*` routes still run server-side (that is how the server-only keys stay server-only).

If a problem tempts you to violate one of these, stop and pull a different lever, or
escalate the question.

## Tech Stack

- **Framework**: Nuxt 4 (Vue 3, `<script setup>` Composition API, TypeScript strict)
- **UI**: Nuxt UI 4 (Tailwind CSS v4 + Reka UI) — components are `U*` (e.g. `UButton`,
  `UCard`, `UModal`), theming in `app/app.config.ts` + `app/assets/css/main.css`
- **Backend**: Supabase — Auth (Google), Postgres + RLS, Realtime — via the
  [`@nuxtjs/supabase`](https://supabase.nuxtjs.org) module (`useSupabaseClient`,
  `useSupabaseUser`; `serverSupabaseUser`/`serverSupabaseServiceRole` on the server)
- **Schema**: `supabase/migrations/*.sql` (tables, RLS, triggers, realtime publication);
  typed client via `app/types/database.types.ts`
- **External data**: TMDB, proxied through Nuxt server routes (`server/api/movies/*`)
- **Package Manager**: npm
- **Testing**: Vitest for unit; Playwright for E2E
- **Deploy**: Vercel (Nuxt build → SPA + serverless functions for `/api`)

## Common Commands

```bash
npm install            # Install deps (runs `nuxt prepare` postinstall)
npm run dev            # Dev server (http://localhost:3000)
npm run build          # Production build (Nitro server + SPA client)
npm run generate       # Static-ish output
npm run preview        # Preview a production build
npm run lint           # ESLint (@nuxt/eslint)
npm run typecheck      # vue-tsc type check
npm test               # Vitest (run once)
npm run test:watch     # Vitest (watch mode)
```

## Project Structure

Nuxt 4 uses an `app/` source directory. Auto-imports are on (components, composables,
`ref`/`computed`, Nuxt UI components) — don't add manual imports for those.

```
app/
├── app.vue                       # Root: <UApp><NuxtLayout><NuxtPage/></NuxtLayout></UApp>
├── app.config.ts                 # Nuxt UI theme (primary/neutral colors)
├── assets/css/main.css           # Tailwind + Nuxt UI import + theme tokens
├── components/                   # SearchBar, SuggestionCard, EventCard, AddEventModal, ...
├── composables/                  # useTmdb, useEvents, useSuggestions, ...
├── layouts/
│   └── default.vue               # App shell: nav (avatar menu, color mode), main container
├── middleware/
│   └── admin.ts                  # Gate /admin to admins (global auth is the Supabase module)
├── pages/
│   ├── index.vue                 # Landing
│   ├── login.vue                 # Google sign-in
│   ├── confirm.vue               # OAuth callback → /overview
│   ├── overview.vue              # Events + suggest + vote (the core experience)
│   ├── admin.vue                 # Event CRUD + suggestion moderation
│   ├── profile.vue               # Profile + account deletion
│   └── about.vue
├── plugins/
│   └── auth-profile.client.ts    # Load the user's profile (incl is_admin) into state
├── types/database.types.ts       # Typed Supabase Database
└── utils/
    └── sanitize.ts               # HTML sanitization for stored rich text
server/
└── api/
    ├── movies/                   # TMDB proxy (search) — server-only key
    └── account/delete.post.ts    # Account deletion (service role)
shared/types/                     # Shared types (MovieEvent, Suggestion, TmdbMovie, Profile)
supabase/migrations/             # ⭐ Schema + RLS + triggers (authorization source of truth)
scripts/migrate-firestore-to-supabase.mjs  # One-time Firestore → Supabase ETL
```

## Architecture Notes

### Auth & roles

- The `@nuxtjs/supabase` module provides the client (`useSupabaseClient`) and the reactive
  user (`useSupabaseUser`), plus a global middleware that redirects unauthenticated users
  to `/login` (config in `nuxt.config.ts`; public routes via `redirectOptions.exclude`).
- Sign-in is Google OAuth (`signInWithOAuth`), redirecting to `/confirm`. A Postgres
  trigger (`handle_new_user`) creates the `profiles` row from OAuth metadata.
- `app/plugins/auth-profile.client.ts` loads the user's profile (incl `is_admin`) into
  shared state; `useAuth` exposes a merged `account` + `isAdmin`.
- `app/middleware/admin.ts` gates `/admin` for UX. **It is not security** — see Invariant 1.
  RLS is the real boundary.

### Data model (Postgres — see `supabase/migrations`)

```
profiles(id→auth.users, email, display_name, avatar_url, is_admin)
events(id, title, description, event_date, created_by, created_at)
suggestions(id, event_id→events, user_id→profiles, tmdb_movie jsonb, deleted, created_at)
votes(suggestion_id→suggestions, user_id→profiles)  -- PK (suggestion_id, user_id)
```

Triggers enforce the per-event suggestion/vote limits (skipped for service-role inserts so
historical data can be imported). RLS: read for authenticated; create-as-self; admin-only
moderation; author/admin delete; users can't change their own `is_admin`.

### Realtime

Supabase Realtime channels (`supabase.channel(...).on('postgres_changes', ...)`) in the
data composables keep votes/suggestions/events live. The relevant tables are added to the
`supabase_realtime` publication in the migration. On a change we re-query (simple and
reliable for this scale) rather than patching state.

### TMDB proxy

Client → `GET /api/movies/search?q=...` → server handler reads `runtimeConfig.tmdbApiKey`
→ TMDB. Validate and clamp query params at the boundary. Never call TMDB from a component.

## Environment

Copy `.env.example` to `.env` and fill in real values (Supabase dashboard → Settings → API):

```
SUPABASE_URL=https://<ref>.supabase.co     # project URL
SUPABASE_KEY=<anon key>                     # public — protected by RLS, read by the module
NUXT_SUPABASE_SECRET_KEY=<service-role key> # SERVER-ONLY (account deletion)
NUXT_TMDB_API_KEY=<tmdb key>                # SERVER-ONLY → runtimeConfig.tmdbApiKey
```

Never commit a real `.env`. `.env.example` carries placeholders only — no live keys.

## Conventions

- Vue 3 `<script setup lang="ts">` only. No Options API, no class components, no Vuex.
- Composition API + composables for shared logic; Pinia only if global state truly earns it.
- Nuxt UI components (`U*`) over hand-rolled markup; theme via `app.config.ts`, not ad-hoc CSS.
- Tailwind utility classes for layout; avoid bespoke SCSS unless a utility genuinely can't.
- Auto-imports are on — don't import `ref`, `computed`, components, or composables manually.
- Mobile-first and responsive by default; verify both viewports for any UI change.

## Code Standards

### Clean Code

- **DRY**: Do not repeat yourself. Extract shared logic into composables/utilities. If you
  see duplication, refactor it.
- **SRP (Single Responsibility Principle)**: Every function, composable, and component does
  one thing. If a function needs an "and" to describe it, split it.
- **Small, modular functions**: Prefer many small composable functions over few large ones.
  Each should be independently understandable and testable.
- **Never over-engineer**: Write the minimum code needed to solve the problem correctly. No
  speculative abstractions or "just in case" code. Simple and clear beats clever.
- **Naming**: Use descriptive, intention-revealing names. Code should read like prose.
- **No dead code**: Remove unused imports, variables, functions, and commented-out code.
  Don't leave TODOs without action.

## Testing

No PR is mergeable without tests that cover the behavior introduced or changed in that PR.

This is not negotiable. If the code is worth shipping, it is worth testing. If it is too
hard to test, that is a signal the code needs to be restructured, not that the test can be
skipped.

### The Testing Pyramid

Follow the testing pyramid. Violations of its proportions are a code smell.

```
        /\
       /  \
      / E2E\
     /------\
    /  Integ- \
   / ration    \
  /-------------\
 /   Unit Tests  \
/-----------------\
```

**Unit tests** form the base and should be the majority of the suite — fast, isolated, no
I/O or network. Test a single composable, util, or component in isolation (Vitest +
`@nuxt/test-utils`). If your unit tests are slow, they are not unit tests.

**Integration tests** sit in the middle — a server route against a local Supabase, a
component plus the composable it consumes. Fewer than unit tests, allowed to be slower.

**End-to-end tests** sit at the top — few, slow, and only the critical user paths
(sign-in, suggest a movie, vote, admin creates an event). One per path that would be
catastrophic to break silently, not one per feature.

### Unit Tests (Vitest)

- Every new composable, util, or component gets unit tests.
- Test behavior, not implementation. A test that breaks on an internal rename is testing
  the wrong thing.
- Mock at integration boundaries (the Supabase client, `$fetch`/TMDB, time). Do not mock
  your own collaborators — if you must, the design needs work.
- A test that cannot fail is not a test. Break the implementation once to confirm it fails.
- Tests are documentation: `it("hides the vote button when the event is locked")`, not
  `it("works")`.

### Integration Tests

- Server routes, Supabase queries, and RLS policies all need integration coverage. Prefer
  **Supabase local** (`supabase start`) or a dedicated test project over mocks for RLS and
  data-shape tests — policy bugs are exactly the kind that unit tests can't catch.
- Test the contract at the boundary (request/response shape, status codes, side effects),
  not the internal call graph. Seed and tear down data per test.

### End-to-End Tests (Playwright)

Any PR that introduces or meaningfully changes UI behavior must include Playwright tests
covering that behavior.

- Use [Playwright](https://playwright.dev) for all E2E tests. E2E specs live in a dedicated
  `e2e/` directory and run in CI on every PR. A failing E2E test blocks merge.
- Write E2E for critical journeys (login, suggest, vote, admin event CRUD), new
  interactive flows, and UI bug fixes (a test that would have caught the regression).
- Don't write E2E for every component (use unit/component tests), purely cosmetic changes,
  or logic already covered lower in the pyramid.
- Prefer semantic locators (`getByRole`, `getByLabel`, `getByText`) over CSS selectors.
  Use `data-testid` deliberately when semantics aren't enough.
- Never use hard-coded `waitForTimeout`. Use auto-waiting / `waitForResponse` /
  `waitForLoadState`. Tests must be deterministic — a test that passes 9/10 is broken.

### Coverage

- Coverage is a floor, not a goal. 80% coverage with tests that verify behavior beats 100%
  with meaningless ones. New code should not lower coverage; enforce in CI.

### What is not an acceptable excuse

- "It's just a small change." Small changes break things.
- "It's hard to test." Make it testable. Difficulty is a design signal.
- "I'll add tests in a follow-up PR." You won't. Tests go in the same PR.
- "The existing tests cover it." Show that they do, explicitly. If not, add tests.
- "It's just a UI change." New UI gets Playwright tests.

## Security

- **Security is a priority, not an afterthought.**
- Never commit secrets, tokens, or credentials. Use `.env` (gitignored); `.env.example`
  holds placeholders only. The TMDB key is **server-only** (Invariant 2).
- **RLS policies are the authorization boundary** (Invariant 1). Every table needs
  policies; test them against Supabase local. Client middleware is not a gate.
- Validate and sanitize all user input at boundaries: TMDB query params (server routes),
  form data, and especially stored rich text before render (Invariant 5).
- Guard against the OWASP top 10 — XSS in particular (`v-html` of stored content is the
  obvious foot-gun here).
- Treat external API responses (TMDB) as untrusted: missing `release_date`, `overview`,
  `poster_path`, etc. must not crash the UI — render defensively.
- Review dependencies for known vulnerabilities (`npm audit`).

## Git Workflow

- **Always work from a feature branch.** Never commit directly to `main`. Use descriptive
  names: `feat/vote-limits`, `fix/admin-voters-race`.
- **Commit often — many small commits per PR.** A PR should land as a sequence of small,
  logical commits, never one big squashed blob. Each commit is one coherent step (a schema
  migration, a composable, the UI wiring, the tests for it) that builds and is independently
  reviewable, so the PR can be **analyzed and unwound bit by bit** — read commit-by-commit,
  `git bisect`, or revert a single step without losing the rest. If a commit needs "and" to
  describe it, split it. Don't batch unrelated changes into one commit.
- **Conventional commit messages.** Prefixes:
  - `feat:` — New feature or capability
  - `fix:` — Bug fix
  - `refactor:` — Code restructuring, no behavior change
  - `test:` — Adding or updating tests
  - `chore:` — Build, CI, deps, tooling
  - `docs:` — Documentation changes
  - `perf:` — Performance improvements
  - `style:` — Formatting, whitespace (no logic changes)
- **Messages describe _what_ and _why_, not _how_.** e.g. `fix: resolve admin voters race
  by awaiting profile lookups before assigning state`.
- **Submit PRs to `main` with `gh pr create`.** Clear titles using the same prefixes;
  include a summary and a test plan.
- **The user reviews all PRs before merge.** Do not merge autonomously.
- **NEVER add `Co-Authored-By` or "Generated with Claude Code" to commits or PRs.**

### PR Description Template

An empty PR description turns review into a game of telephone. Fill out the template below
in every PR body (drop sections that genuinely don't apply). A reviewer should understand
_what_ changed and _why_ without having to ask. WHAT and WHY live in the prose; the _how_
lives in the diff.

```markdown
## Scope

<!-- Brief description of WHAT you're doing and WHY. The big picture. -->

closes #<issue>

## Implementation

<!-- HOW you achieved it. High-level flow, any refactor, tradeoffs, and anything
you'd like reviewers to look at especially closely. -->

## Screenshots

<!-- This is a visual app — show, don't tell. For any UI change, include before/after
for BOTH desktop and mobile. -->

|         | before | after |
| ------- | ------ | ----- |
| desktop |        |       |
| mobile  |        |       |

## How to Test

<!-- 1) Automated coverage: which unit/integration/e2e tests you added or updated for
the behavior in this PR (no PR merges without them). 2) Manual repro: step-by-step so a
reviewer unfamiliar with this area can verify it. -->

## Invariants & Risk

<!-- Does this touch authorization (RLS policies / middleware), the TMDB key,
vote integrity, the admin role, or rendered user HTML? Confirm the Product Invariants
hold. Call out any rules/schema/index changes explicitly. -->

## Emoji Guide

**For reviewers: emojis call out blocking vs. non-blocking feedback.**

| Type         | Emoji          | Meaning                                       |
| ------------ | -------------- | --------------------------------------------- |
| Blocking     | 🔴 ❌ 🚨       | Must be addressed before merge                |
| Non-blocking | 🟡 💡 🤔 💭    | Minor suggestion, nit, or clarifying question |
| Praise       | 🟢 💚 😍 👍 🙌 | Positive feedback — a crucial part of review  |
```

## TypeScript

### Tooling & CI Enforcement

- Run `npm run typecheck` (vue-tsc) in CI. Type checking is not optional.
- Run ESLint (`@nuxt/eslint`, which includes `@typescript-eslint`) in CI.
- Keep dependencies updated regularly. `npm audit` is part of CI; deferred updates compound
  into painful multi-version migrations.

### Type Discipline

- Never use `any`. Reach for `unknown` and narrow it properly. `any` is a silent type hole.
- Avoid type assertions (`as SomeType`) except at well-justified boundaries (parsing
  external data like TMDB responses). Every `as` is a promise to the compiler — comment why
  it's safe.
- Do not use `@ts-ignore`. Use `@ts-expect-error` with a comment if suppression is truly
  necessary — it errors when no longer needed, prompting cleanup.
- Prefer `interface` for object shapes that may be extended; `type` for unions/intersections.
  Be consistent.
- Use `readonly` / `Readonly<T>` wherever mutation isn't intended.
- Avoid enums. Prefer `as const` objects with a derived union type.

### Narrowing & Control Flow

- Use type guards (`is` predicates) and discriminated unions instead of casting out of
  ambiguity.
- Prefer exhaustive checks on unions with an `assertNever(x)` default branch.
- Keep nullable handling explicit. Lean on `?.` and `??` rather than loose truthiness, which
  silently swallows `0` and `""`. (Supabase rows have many nullable columns — this matters.)

### Error Handling

- Do not swallow errors with empty `catch` blocks. At minimum, log and rethrow.
- Always check `error instanceof Error` before accessing `.message`.
- For functions that can meaningfully fail, consider a result-style discriminated union
  (`{ ok: true; value: T } | { ok: false; error: string }`) over throwing, especially across
  async boundaries.

### Functions & Interfaces

- Prefer explicit return types on exported functions and composables. Inference is fine
  internally; explicit return types are documentation and catch unintended widening.
- Keep functions small and single-purpose.
- `const` arrow functions for utilities/callbacks; `function` declarations for top-level
  named functions where hoisting and stack-trace readability matter.

### Async

- Every `Promise` must be awaited, returned, or explicitly handled. Floating promises hide
  errors and cause test races (`@typescript-eslint/no-floating-promises`).
- Prefer `async/await` over `.then()/.catch()` chains for readability.
- Handle async errors at the right level — let them bubble to a boundary where you can do
  something meaningful, rather than wrapping every `await`.

### Patterns & Idioms

- Use array methods (`.map()`, `.filter()`, `.reduce()`, `.flatMap()`) where intent is
  cleaner, but don't chain so deeply a loop would read better. Clarity wins.
- Avoid index signatures (`[key: string]: T`) unless the key space is genuinely dynamic. Use
  `Record<K, V>` with a concrete key union when you know the shape.
- Don't overuse generics. Add them when earned by actual reuse.
- Use barrel files deliberately, not reflexively (circular-dep and bundler-cost risks).

### Reviewer Empathy

- Explicit types, no `any`, no suppressed errors, and consistent formatting let a reviewer
  focus on logic, not on deciphering runtime values.
- Types are documentation that cannot go stale. Write them like your reviewer has never seen
  this codebase before — because eventually, they won't have.
