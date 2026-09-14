import type { SupabaseClient } from '@supabase/supabase-js'
import type { RsvpStatus } from '#shared/types/rsvp'
import type { Database } from '~/types/database.types'

/** The e-vite row a reply is being recorded against. */
export interface InviteTarget {
  id: string
  event_id: string
  email: string
}

export interface InviteReply {
  /** null clears the reply back to "no reply yet" (so they're remindable again). */
  status: RsvpStatus | null
  /** Additional guests; only kept when going. Already validated by the caller. */
  plusOnes: number
  /** Stamp clicked_at too — true when the reply came from the e-vite link itself. */
  markClicked?: boolean
}

/**
 * Record an RSVP against an e-vite row and mirror it into the member's in-app
 * RSVP when the email belongs to a member. One writer for every reply path (the
 * public one-click link, an admin replying on someone's behalf) so the two RSVP
 * stores can't disagree about who said what. Runs under whatever client the
 * caller hands in: the service role for the token route (no session), the
 * admin's own RLS-scoped session for the admin route.
 */
export async function recordInviteRsvp(
  db: SupabaseClient<Database>,
  invite: InviteTarget,
  reply: InviteReply
): Promise<{ status: RsvpStatus | null, plusOnes: number }> {
  const { status } = reply
  // Guests only count when going.
  const plusOnes = status === 'going' ? reply.plusOnes : 0
  const now = new Date().toISOString()

  const { error: inviteError } = await db
    .from('event_invites')
    .update({
      rsvp: status,
      rsvp_at: status ? now : null,
      plus_ones: plusOnes,
      ...(reply.markClicked ? { clicked_at: now } : {})
    })
    .eq('id', invite.id)
  if (inviteError) throw inviteError

  // Mirror into the app RSVP if this invitee is also a member (case-insensitive).
  const { data: profile, error: profileError } = await db
    .from('profiles')
    .select('id')
    .ilike('email', invite.email)
    .maybeSingle()
  if (profileError) throw profileError
  if (profile) {
    const { error: rsvpError } = status
      ? await db
          .from('rsvps')
          .upsert({ event_id: invite.event_id, user_id: profile.id, status, plus_ones: plusOnes, updated_at: now }, { onConflict: 'event_id,user_id' })
      : await db
          .from('rsvps')
          .delete()
          .eq('event_id', invite.event_id)
          .eq('user_id', profile.id)
    if (rsvpError) throw rsvpError
  }

  return { status, plusOnes }
}
