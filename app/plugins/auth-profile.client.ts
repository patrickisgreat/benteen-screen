import type { Database } from '~/types/database.types'
import type { Profile } from '#shared/types/user'

/**
 * Keeps the current user's profile row (including `is_admin`) in shared state,
 * reloading whenever the Supabase auth user changes. One watcher app-wide.
 */
export default defineNuxtPlugin(() => {
  const supabase = useSupabaseClient<Database>()
  const user = useSupabaseUser()
  const profile = useState<Profile | null>('profile', () => null)

  watch(user, async () => {
    if (!user.value) {
      profile.value = null
      return
    }
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.value.id)
      .single()
    profile.value = data ?? null
  }, { immediate: true })
})
