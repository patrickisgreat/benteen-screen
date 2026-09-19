import type { SupabaseClient } from '@supabase/supabase-js'
import type { AnnounceRecipient, AnnounceScope } from '#shared/utils/announce'
import { toRsvpStatus, type RsvpStatus } from '#shared/types/rsvp'
import type { Database } from '~/types/database.types'

type Db = SupabaseClient<Database>

/** Someone this event knows about, with whatever reply we have for them. Only a
 *  guest-list entry can have a null reply — an in-app RSVP always says something. */
interface Attendee {
  email: string
  name: string | null
  rsvp: RsvpStatus | null
}

function normalize(email: string | null | undefined): string {
  return email?.trim().toLowerCase() ?? ''
}

function sortByName(people: AnnounceRecipient[]): AnnounceRecipient[] {
  return people.sort((a, b) => (a.name ?? a.email).localeCompare(b.name ?? b.email))
}

/**
 * Everyone this event knows about, keyed by email: the curated guest list
 * (`event_invites`) merged with members who RSVP'd in the app.
 *
 * Both sources are needed. A trigger mirrors a member's in-app RSVP onto their
 * e-vite row, but only when they're already on the guest list — a member who
 * RSVP'd without being invited exists solely in `rsvps`, and a plain-email guest
 * exists solely in `event_invites`. Reading one table alone silently drops one of
 * those groups from every audience.
 */
async function loadAttendees(db: Db, eventId: string): Promise<Attendee[]> {
  const [guestList, inApp] = await Promise.all([
    db.from('event_invites').select('email, display_name, rsvp').eq('event_id', eventId),
    db.from('rsvps').select('user_id, status').eq('event_id', eventId)
  ])

  const byEmail = new Map<string, Attendee>()
  for (const row of guestList.data ?? []) {
    const email = normalize(row.email)
    if (email) {
      byEmail.set(email, {
        email,
        name: row.display_name,
        rsvp: row.rsvp === null ? null : toRsvpStatus(row.rsvp)
      })
    }
  }

  const responders = inApp.data ?? []
  if (responders.length) {
    const { data: profiles } = await db
      .from('profiles')
      .select('id, email, display_name')
      .in('id', responders.map(r => r.user_id))
    const profileById = new Map((profiles ?? []).map(p => [p.id, p]))

    for (const rsvp of responders) {
      const profile = profileById.get(rsvp.user_id)
      const email = normalize(profile?.email)
      if (!email) continue
      const existing = byEmail.get(email)
      byEmail.set(email, {
        email,
        name: existing?.name ?? profile?.display_name ?? null,
        // The in-app reply is the fresher of the two when the guest row is silent.
        rsvp: existing?.rsvp ?? toRsvpStatus(rsvp.status)
      })
    }
  }

  return [...byEmail.values()]
}

/** Everyone on the club allowlist, optionally only those who've actually joined. */
async function loadRoster(db: Db, joinedOnly: boolean): Promise<AnnounceRecipient[]> {
  let query = db.from('invites').select('email, display_name')
  if (joinedOnly) query = query.not('accepted_at', 'is', null)
  const { data } = await query
  const byEmail = new Map<string, AnnounceRecipient>()
  for (const row of data ?? []) {
    const email = normalize(row.email)
    if (email && !byEmail.has(email)) byEmail.set(email, { email, name: row.display_name })
  }
  return [...byEmail.values()]
}

function toRecipients(attendees: Attendee[]): AnnounceRecipient[] {
  return attendees.map(({ email, name }) => ({ email, name }))
}

/**
 * Resolve a blast's audience: who `scope` means for this event, deduped by email
 * and sorted by name. The single source of truth for recipients — the preview the
 * admin sees and the list the send actually uses both come from here, so the
 * count on the button can't disagree with what leaves the building.
 */
export async function resolveAnnounceRecipients(
  db: Db,
  eventId: string,
  scope: AnnounceScope
): Promise<AnnounceRecipient[]> {
  if (scope === 'invited' || scope === 'members') {
    return sortByName(await loadRoster(db, scope === 'members'))
  }

  const attendees = await loadAttendees(db, eventId)
  switch (scope) {
    case 'guests':
      return sortByName(toRecipients(attendees))
    case 'going':
      return sortByName(toRecipients(attendees.filter(a => a.rsvp === 'going')))
    case 'going_maybe':
      return sortByName(toRecipients(attendees.filter(a => a.rsvp === 'going' || a.rsvp === 'maybe')))
    case 'no_reply':
      // Silence can only come from the guest list — an in-app RSVP is a reply.
      return sortByName(toRecipients(attendees.filter(a => a.rsvp === null)))
  }
}

/**
 * Narrow a resolved audience to the addresses the admin actually ticked. An
 * unknown address is dropped rather than emailed: the picker can only ever
 * subtract from the scope, never smuggle someone new into the blast.
 */
export function selectRecipients(
  audience: readonly AnnounceRecipient[],
  selected: readonly string[] | null
): AnnounceRecipient[] {
  if (!selected) return [...audience]
  const wanted = new Set(selected.map(normalize))
  return audience.filter(person => wanted.has(person.email))
}
