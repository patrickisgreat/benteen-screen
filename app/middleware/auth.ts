/**
 * Route guard: require a signed-in user. UX only — Firestore Security Rules are
 * the real authorization boundary (Product Invariant 1).
 */
export default defineNuxtRouteMiddleware(async () => {
  const { $firebaseAuth } = useNuxtApp()
  const user = await awaitCurrentUser($firebaseAuth)
  if (!user) {
    return navigateTo('/login')
  }
})
