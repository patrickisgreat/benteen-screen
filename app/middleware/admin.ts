import type { Database } from '~/types/database.types'

/**
 * Route guard: require the admin role. UX only — RLS is the real authorization
 * boundary. (Global auth protection is handled by the Supabase module.)
 */
export default defineNuxtRouteMiddleware(async () => {
  const user = useSupabaseUser()
  if (!user.value) return navigateTo('/login')

  const supabase = useSupabaseClient<Database>()
  const { data } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.value.id)
    .single()

  if (!data?.is_admin) return navigateTo('/overview')
})
