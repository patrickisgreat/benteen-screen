import type { Database } from '~/types/database.types'

// Invite-only gate (UX layer over the RLS boundary — Invariant 1). The Supabase
// module already bounces *unauthenticated* users to /login; this catches users
// who are authenticated but whose email isn't on the allowlist (public.invites):
// it ends their session and sends them to /request-access.
const PUBLIC_PATHS = new Set(['/', '/about', '/login', '/confirm', '/request-access', '/reset-password', '/rsvp'])

export default defineNuxtRouteMiddleware(async (to) => {
  if (PUBLIC_PATHS.has(to.path)) return

  const user = useSupabaseUser()
  if (!user.value) return // not signed in → the Supabase module handles the redirect

  const supabase = useSupabaseClient<Database>()
  // Cache the verdict for the session so we hit the RPC once, not per navigation.
  const allowed = useState<boolean | null>('is-allowed', () => null)
  if (allowed.value === null) {
    const { data, error } = await supabase.rpc('is_allowed')
    if (error) {
      // Couldn't determine allow-status (e.g. the is_allowed function/migration
      // isn't present yet, or a transient RPC failure). This gate is UX only —
      // RLS is the real boundary (Invariant 1) — so we must NOT lock everyone out
      // on an infra hiccup. Let the user through; RLS still governs their data.
      console.warn('[invited] is_allowed check failed; allowing through (RLS still enforces access):', error.message)
      return
    }
    allowed.value = data ?? false
  }
  if (allowed.value) return

  // Explicit deny. Clear the cached verdict before signing out so a *different*
  // user signing in later in the same SPA session (e.g. email/password, which
  // doesn't reload the page) is re-checked rather than inheriting this stale deny.
  allowed.value = null
  await supabase.auth.signOut()
  return navigateTo('/request-access')
})
