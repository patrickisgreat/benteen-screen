import type { Database } from '~/types/database.types'
import type { Profile } from '#shared/types/user'

/**
 * Reactive auth state + sign-in/out. `account` is a display-friendly merge of the
 * Supabase user (immediately available from OAuth metadata) and the profile row
 * (loaded by the auth-profile plugin). `isAdmin` is the UI gate — RLS is the real
 * authorization boundary.
 */
export function useAuth() {
  const supabase = useSupabaseClient<Database>()
  const user = useSupabaseUser()
  const profile = useState<Profile | null>('profile', () => null)

  const isAdmin = computed(() => profile.value?.is_admin ?? false)

  const account = computed(() => {
    if (!user.value) return null
    const meta = (user.value.user_metadata ?? {}) as Record<string, string | undefined>
    return {
      id: user.value.id,
      email: profile.value?.email ?? user.value.email ?? null,
      displayName: profile.value?.display_name ?? meta.full_name ?? meta.name ?? user.value.email ?? null,
      avatarUrl: profile.value?.avatar_url ?? meta.avatar_url ?? meta.picture ?? null
    }
  })

  async function signInWithGoogle(): Promise<void> {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/confirm` }
    })
  }

  async function signOutUser(): Promise<void> {
    await supabase.auth.signOut()
    profile.value = null
  }

  return { user, profile, account, isAdmin, signInWithGoogle, signOutUser }
}
