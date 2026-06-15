import { deleteUser, GoogleAuthProvider, reauthenticateWithPopup } from 'firebase/auth'
import { deleteDoc, doc } from 'firebase/firestore'

/** Account-level actions for the signed-in user. */
export function useAccount() {
  const { $firebaseAuth, $firestore } = useNuxtApp()

  /**
   * Delete the current user's profile document and Firebase Auth account.
   * Firebase requires a recent login to delete an account — if it's stale we
   * re-authenticate with Google and retry.
   */
  async function deleteAccount(): Promise<void> {
    const current = $firebaseAuth.currentUser
    if (!current) return

    const purge = async (): Promise<void> => {
      await deleteDoc(doc($firestore, 'users', current.uid)).catch(() => {})
      await deleteUser(current)
    }

    try {
      await purge()
    } catch (error) {
      if ((error as { code?: string }).code === 'auth/requires-recent-login') {
        await reauthenticateWithPopup(current, new GoogleAuthProvider())
        await purge()
      } else {
        throw error
      }
    }
  }

  return { deleteAccount }
}
