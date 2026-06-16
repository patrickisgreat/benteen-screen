import type { Database } from '~/types/database.types'

/**
 * Route guard: require the admin role. UX only — RLS is the real authorization
 * boundary. (Global auth protection is handled by the Supabase module.)
 *
 * Uses getUser() (validates the token) rather than the cached useSupabaseUser()
 * id — the cached id could be stale/mismatched, which made admins bounce here.
 */
export default defineNuxtRouteMiddleware(async () => {
  const supabase = useSupabaseClient<Database>()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return navigateTo('/login')

  const { data } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()

  if (!data?.is_admin) return navigateTo('/overview')
})
