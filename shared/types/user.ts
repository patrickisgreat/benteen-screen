/** A user profile row (public.profiles). */
export interface Profile {
  id: string
  email: string | null
  display_name: string | null
  avatar_url: string | null
  is_admin: boolean
  blocked: boolean
  created_at: string
}

/** Admin-only person-level contact details (public.contacts), keyed by email. */
export interface Contact {
  email: string
  phone: string | null
  updated_at: string
}

/** What an admin can see and edit about one person in the directory — a member
 *  (profileId set) or a pending roster entry (profileId null). Email is the key
 *  and is not editable here: it is how a member signs in. */
export interface PersonDetails {
  email: string
  profileId: string | null
  displayName: string | null
  /** E.164 mobile number, or null when unknown. */
  phone: string | null
}
