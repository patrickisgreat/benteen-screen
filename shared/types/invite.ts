/** An allowlist entry (public.invites). accepted_at is set once the invited
 *  email has signed in; until then it's a pending invite. */
export interface Invite {
  email: string
  invited_by: string | null
  display_name: string | null
  created_at: string
  accepted_at: string | null
}
