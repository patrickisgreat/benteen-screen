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

  const callbackUrl = (): string => `${window.location.origin}/confirm`

  // OAuth providers redirect away to the provider then back to /confirm; the
  // page unloads, so there's nothing to await beyond kicking it off.
  async function oauth(provider: 'google' | 'facebook'): Promise<void> {
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: callbackUrl() }
    })
    if (error) throw error
  }
  const signInWithGoogle = (): Promise<void> => oauth('google')
  const signInWithFacebook = (): Promise<void> => oauth('facebook')

  // Email/password. Sign-in sets the session immediately (no redirect); sign-up
  // sends a confirmation email whose link returns to /confirm. Both still pass
  // through the invite-only gate after auth (middleware/invited.global.ts).
  async function signInWithEmail(email: string, password: string): Promise<void> {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  }

  // Returns whether a confirmation email is pending. With email confirmation on,
  // signUp returns no session (the user must confirm first); with it off, a live
  // session comes back and they're signed in immediately — the caller branches
  // on this so it never tells a signed-in user to "check your inbox".
  async function signUpWithEmail(email: string, password: string): Promise<{ needsConfirmation: boolean }> {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: callbackUrl() }
    })
    if (error) throw error
    return { needsConfirmation: !data.session }
  }

  // The recovery link lands on /reset-password (a public page that sets the new
  // password), not /confirm — /confirm would just bounce the recovery session
  // straight into the app without ever changing the password.
  async function sendPasswordReset(email: string): Promise<void> {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`
    })
    if (error) throw error
  }

  async function signOutUser(): Promise<void> {
    await supabase.auth.signOut()
    profile.value = null
    myId.value = null
    isAllowed.value = null
  }

  return {
    user,
    myId,
    profile,
    account,
    isAdmin,
    signInWithGoogle,
    signInWithFacebook,
    signInWithEmail,
    signUpWithEmail,
    sendPasswordReset,
    signOutUser
  }
}
