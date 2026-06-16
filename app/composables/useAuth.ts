import type { Database } from '~/types/database.types'
import type { Profile } from '#shared/types/user'

/**
 * Reactive auth state + sign-in/out. `myId` is the authoritative current user id
 * (resolved via getUser() in the auth-profile plugin) — use it for "is this
 * mine?" checks, not the cached Supabase user id. `isAdmin` comes from the
 * profile row. RLS remains the real authorization boundary.
 */
export function useAuth() {
  const supabase = useSupabaseClient<Database>()
  const user = useSupabaseUser()
  const myId = useState<string | null>('my-id', () => null)
  const profile = useState<Profile | null>('profile', () => null)
  // Cached allowlist verdict (set by middleware/invited.global.ts); cleared on
  // sign-out so the next user is re-checked within the same SPA session.
  const isAllowed = useState<boolean | null>('is-allowed', () => null)

  const isAdmin = computed(() => profile.value?.is_admin ?? false)

  const account = computed(() => {
    if (!user.value && !profile.value) return null
    const meta = (user.value?.user_metadata ?? {}) as Record<string, string | undefined>
    return {
      id: myId.value ?? user.value?.id ?? null,
      email: profile.value?.email ?? user.value?.email ?? null,
      displayName: profile.value?.display_name ?? meta.full_name ?? meta.name ?? user.value?.email ?? null,
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
    myId.value = null
    isAllowed.value = null
  }

  return { user, myId, profile, account, isAdmin, signInWithGoogle, signOutUser }
}
