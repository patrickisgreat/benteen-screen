/** The application's view of a signed-in user (subset of the Firebase user + role). */
export interface AppUser {
  uid: string
  displayName: string | null
  email: string | null
  photoURL: string | null
  providerId?: string
  isAdmin?: boolean
}
