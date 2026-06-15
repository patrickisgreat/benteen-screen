import { getApp, getApps, initializeApp } from 'firebase/app'
import { getAuth, onAuthStateChanged } from 'firebase/auth'
import { doc, getFirestore, setDoc } from 'firebase/firestore'
import { VueFire, VueFireAuth } from 'vuefire'

/**
 * Initializes the Firebase app and installs VueFire (Auth + Firestore) so that
 * `useCurrentUser`, `useCollection`, `useDocument`, etc. are available in
 * component setup. Also keeps the `users/{uid}` profile in sync on sign-in.
 *
 * Client-only: Firebase Auth needs `window`, and the app runs as an SPA
 * (`ssr: false`). The Firebase web config is public by design — access is
 * gated by Firestore Security Rules, not secrecy (see CLAUDE.md invariants).
 */
export default defineNuxtPlugin((nuxtApp) => {
  const { firebase } = useRuntimeConfig().public

  const firebaseApp = getApps().length ? getApp() : initializeApp({ ...firebase })
  const firebaseAuth = getAuth(firebaseApp)
  const firestore = getFirestore(firebaseApp)

  nuxtApp.vueApp.use(VueFire, {
    firebaseApp,
    modules: [VueFireAuth()]
  })

  // Mirror the signed-in user into their `users/{uid}` profile document.
  onAuthStateChanged(firebaseAuth, (user) => {
    if (!user) return
    setDoc(
      doc(firestore, 'users', user.uid),
      {
        uid: user.uid,
        displayName: user.displayName,
        email: user.email,
        photoURL: user.photoURL,
        providerId: user.providerData[0]?.providerId ?? 'google.com'
      },
      { merge: true }
    ).catch(error => console.error('Failed to sync user profile', error))
  })

  return {
    provide: { firebaseApp, firebaseAuth, firestore }
  }
})
