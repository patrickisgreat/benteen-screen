import { doc, getDoc } from 'firebase/firestore'

/**
 * Route guard: require the admin role. UX only — Firestore Security Rules are
 * the real authorization boundary (Product Invariant 1). Implies `auth`.
 */
export default defineNuxtRouteMiddleware(async () => {
  const { $firebaseAuth, $firestore } = useNuxtApp()
  const user = await awaitCurrentUser($firebaseAuth)
  if (!user) {
    return navigateTo('/login')
  }

  const roleSnap = await getDoc(doc($firestore, 'roles', user.uid))
  const isAdmin = roleSnap.exists() && roleSnap.data().role === 'admin'
  if (!isAdmin) {
    return navigateTo('/overview')
  }
})
