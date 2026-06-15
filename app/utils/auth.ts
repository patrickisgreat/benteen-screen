import type { Auth, User } from 'firebase/auth'
import { onAuthStateChanged } from 'firebase/auth'

/**
 * Resolves the current Firebase user once auth has initialized, then unsubscribes.
 * Used in route middleware where we need a one-shot answer rather than a reactive ref.
 */
export function awaitCurrentUser(auth: Auth): Promise<User | null> {
  return new Promise((resolve, reject) => {
    const unsubscribe = onAuthStateChanged(
      auth,
      (user) => {
        unsubscribe()
        resolve(user)
      },
      reject
    )
  })
}
