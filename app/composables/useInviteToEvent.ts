import type { Database } from '~/types/database.types'
import type { EventGuest } from '#shared/types/event-invite'

export interface InviteToEventResult {
  /** false when they were already on that event's guest list. */
  added: boolean
  sent: number
  failed: number
  error: string | null
}

interface UseInviteToEvent {
  inviteToEvent: (eventId: string, guest: EventGuest, sendNow: boolean) => Promise<InviteToEventResult>
}

/**
 * Put one person on an event's guest list from anywhere (the People tab), and
 * optionally e-vite just them right away — the send route's recipient filter
 * keeps this from blasting the rest of the unsent queue. Admin-only via RLS.
 */
export function useInviteToEvent(): UseInviteToEvent {
  const supabase = useSupabaseClient<Database>()

  async function inviteToEvent(eventId: string, guest: EventGuest, sendNow: boolean): Promise<InviteToEventResult> {
    const { error } = await supabase
      .from('event_invites')
      .insert({ event_id: eventId, email: guest.email, display_name: guest.display_name })
    // 23505 = already on this event's list — fine, we may still be sending.
    if (error && error.code !== '23505') throw error
    const added = !error
    if (!sendNow) return { added, sent: 0, failed: 0, error: null }
    const result = await $fetch<{ ok: boolean, sent: number, failed: number, error: string | null }>(
      `/api/events/${eventId}/invites/send`,
      { method: 'POST', body: { emails: [guest.email] } }
    )
    return { added, sent: result.sent, failed: result.failed, error: result.error }
  }

  return { inviteToEvent }
}
