/** Account-level actions for the signed-in user. */
export function useAccount() {
  const supabase = useSupabaseClient()

  /** Delete the current user's account (server-side) and sign out. */
  async function deleteAccount(): Promise<void> {
    await $fetch('/api/account/delete', { method: 'POST' })
    await supabase.auth.signOut()
  }

  return { deleteAccount }
}
