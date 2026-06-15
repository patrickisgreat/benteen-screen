import { GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth'
import { doc } from 'firebase/firestore'
import { useCurrentUser, useDocument } from 'vuefire'

/**
 * Reactive auth state + sign-in/out actions. `isAdmin` is derived from a live
 * binding to `roles/{uid}` — the UI gate only; real enforcement is in
 * firestore.rules (Product Invariant 1).
 */
export function useAuth() {
  const { $firebaseAuth, $firestore } = useNuxtApp()
  const user = useCurrentUser()

  const roleSource = computed(() =>
    user.value ? doc($firestore, 'roles', user.value.uid) : null
  )
  const role = useDocument<{ role?: string }>(roleSource)
  const isAdmin = computed(() => role.value?.role === 'admin')

  async function signInWithGoogle(): Promise<void> {
    await signInWithPopup($firebaseAuth, new GoogleAuthProvider())
  }

  async function signOutUser(): Promise<void> {
    await signOut($firebaseAuth)
  }

  return { user, isAdmin, signInWithGoogle, signOutUser }
}
