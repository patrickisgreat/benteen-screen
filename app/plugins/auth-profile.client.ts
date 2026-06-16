import type { Database } from '~/types/database.types'
import type { Profile } from '#shared/types/user'

/**
 * Resolves the AUTHORITATIVE current user (via getUser(), which validates the
 * access token) into shared state, then loads their profile. Using getUser()
 * rather than the cached useSupabaseUser() id is deliberate: a stale/mismatched
 * cached id was causing RLS 403s on writes and a missing admin UI.
 */
export default defineNuxtPlugin(() => {
  const supabase = useSupabaseClient<Database>()
  const user = useSupabaseUser()
  const myId = useState<string | null>('my-id', () => null)
  const profile = useState<Profile | null>('profile', () => null)

  watch(user, async () => {
    if (!user.value) {
      myId.value = null
      profile.value = null
      return
    }
    const { data: { user: authUser } } = await supabase.auth.getUser()
    myId.value = authUser?.id ?? null
    if (!myId.value) {
      profile.value = null
      return
    }
    const { data } = await supabase.from('profiles').select('*').eq('id', myId.value).single()
    profile.value = data ?? null
  }, { immediate: true })
})
