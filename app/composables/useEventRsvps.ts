import type { MaybeRefOrGetter } from 'vue'
import type { Database } from '~/types/database.types'
import type { RsvpStatus } from '#shared/types/rsvp'

/** One person's RSVP in the merged roster. */
export interface RsvpEntry {
  /** user id for members, lowercased email for email-only guests. */
  key: string
  name: string
  email: string | null
  avatar: string | null
  status: RsvpStatus
  /** True when the reply came from the e-vite email rather than in-app. */
  viaEmail: boolean
}

/** The unified RSVP roster for an event, grouped by status. */
export interface EventRsvpRoster {
  going: RsvpEntry[]
  maybe: RsvpEntry[]
  no: RsvpEntry[]
  /** Guests on the e-vite list who haven't replied (admin-only — needs event_invites). */
  noReply: { key: string, name: string, email: string }[]
  /** Distinct people who replied (going + maybe + no). */
  total: number
}

const EMPTY: EventRsvpRoster = { going: [], maybe: [], no: [], noReply: [], total: 0 }

/**
 * The single source of truth for "who's coming", merging both RSVP stores at read
 * time so they can never drift:
 *  - public.rsvps        — signed-in members tapping Going/Maybe/No in-app.
 *  - public.event_invites — guests replying via the tokenized e-vite email.
 *
 * Members are authoritative from `rsvps` (the e-vite route already mirrors an email
 * reply into rsvps when the email is a member). Email-only guests are folded in from
 * event_invites, deduped against members by email. event_invites is admin-only by
 * RLS, so a non-admin transparently gets a members-only roster; an admin gets the
 * full picture plus who was invited but hasn't replied. Live via realtime.
 */
export function useEventRsvps(eventId: MaybeRefOrGetter<string | null | undefined>): {
  roster: Ref<EventRsvpRoster>
  error: Ref<string | null>
  refresh: () => Promise<void>
} {
  const supabase = useSupabaseClient<Database>()

  const { data: roster, error, refresh } = useRealtimeQuery<EventRsvpRoster>({
    key: eventId,
    channel: 'event-rsvps',
    tables: [{ table: 'rsvps' }, { table: 'event_invites' }],
    empty: EMPTY,
    errorFallback: 'Failed to load RSVPs',
    load: async (id) => {
      const { data: rsvpRows, error: rsvpError } = await supabase
        .from('rsvps')
        .select('user_id, status')
        .eq('event_id', id)
      if (rsvpError) throw rsvpError

      const userIds = (rsvpRows ?? []).map(r => r.user_id)
      const [profiles, invites] = await Promise.all([
        userIds.length
          ? supabase.from('profiles').select('id, display_name, email, avatar_url').in('id', userIds)
          : Promise.resolve({ data: [], error: null }),
        // Admin-only by RLS — a non-admin gets [] here (no error), i.e. members only.
        supabase.from('event_invites').select('email, display_name, rsvp').eq('event_id', id)
      ])
      if (profiles.error) throw profiles.error
      if (invites.error) throw invites.error

      const profileById = new Map((profiles.data ?? []).map(p => [p.id, p]))
      const memberEmails = new Set<string>()
      const entries: RsvpEntry[] = []

      for (const row of rsvpRows ?? []) {
        const profile = profileById.get(row.user_id)
        const email = profile?.email ?? null
        if (email) memberEmails.add(email.toLowerCase())
        entries.push({
          key: row.user_id,
          name: profile?.display_name ?? email ?? 'Member',
          email,
          avatar: profile?.avatar_url ?? null,
          // DB check constraint guarantees the status enum; narrow at this boundary.
          status: row.status as RsvpStatus,
          viaEmail: false
        })
      }

      const noReply: EventRsvpRoster['noReply'] = []
      for (const invite of invites.data ?? []) {
        // A member is already counted from rsvps (authoritative); skip their e-vite row.
        if (memberEmails.has(invite.email.toLowerCase())) continue
        if (invite.rsvp) {
          entries.push({
            key: invite.email.toLowerCase(),
            name: invite.display_name ?? invite.email,
            email: invite.email,
            avatar: null,
            status: invite.rsvp as RsvpStatus,
            viaEmail: true
          })
        } else {
          noReply.push({ key: invite.email.toLowerCase(), name: invite.display_name ?? invite.email, email: invite.email })
        }
      }

      return {
        going: entries.filter(e => e.status === 'going'),
        maybe: entries.filter(e => e.status === 'maybe'),
        no: entries.filter(e => e.status === 'no'),
        noReply,
        total: entries.length
      }
    }
  })

  return { roster, error, refresh }
}
