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
