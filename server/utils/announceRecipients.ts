import type { SupabaseClient } from '@supabase/supabase-js'
import type { AnnouncePerson } from '#shared/utils/announce'
import { toRsvpStatus } from '#shared/types/rsvp'
import type { Database } from '~/types/database.types'

type Db = SupabaseClient<Database>

function normalize(email: string | null | undefined): string {
  return email?.trim().toLowerCase() ?? ''
}

const blank = (email: string): AnnouncePerson => ({
  email,
  name: null,
  rsvp: null,
  onGuestList: false,
  joined: false,
  onRoster: false
})

/**
 * Everyone this event could mail, keyed by email — the composer's address book.
 *
 * Three sources, because no single table knows everybody. `event_invites` holds
 * the curated guest list, including plain-email guests who never sign in.
 * `rsvps` holds in-app replies; a trigger mirrors those onto the e-vite row, but
 * only for people already on the guest list, so a member who RSVP'd without an
 * invite lives there alone. `invites` is the club allowlist, which is how the
 * club-wide presets reach someone this event never invited.
 *
 * Reading fewer than all three drops a whole category of person from the picker,
 * which is how an audience ends up quietly wrong.
 */
export async function loadAnnounceDirectory(db: Db, eventId: string): Promise<AnnouncePerson[]> {
  const [guestList, inApp, roster] = await Promise.all([
    db.from('event_invites').select('email, display_name, rsvp').eq('event_id', eventId),
    db.from('rsvps').select('user_id, status').eq('event_id', eventId),
    db.from('invites').select('email, display_name, accepted_at')
  ])

  const byEmail = new Map<string, AnnouncePerson>()
  const upsert = (email: string, patch: Partial<AnnouncePerson>): void => {
    const existing = byEmail.get(email) ?? blank(email)
    byEmail.set(email, { ...existing, ...patch, name: existing.name ?? patch.name ?? null })
  }

  for (const row of guestList.data ?? []) {
    const email = normalize(row.email)
    if (!email) continue
    upsert(email, {
      name: row.display_name,
      rsvp: row.rsvp === null ? null : toRsvpStatus(row.rsvp),
      onGuestList: true
    })
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
      // The e-vite row wins when it has a reply: the trigger keeps it current,
      // and an admin can record a reply there for someone who never signs in.
      const known = byEmail.get(email)?.rsvp ?? null
      upsert(email, { name: profile?.display_name ?? null, rsvp: known ?? toRsvpStatus(rsvp.status) })
    }
  }

  for (const row of roster.data ?? []) {
    const email = normalize(row.email)
    if (!email) continue
    upsert(email, { name: row.display_name, onRoster: true, joined: row.accepted_at !== null })
  }

  return [...byEmail.values()].sort((a, b) => (a.name ?? a.email).localeCompare(b.name ?? b.email))
}

/**
 * Narrow the directory to the addresses the admin actually ticked. An address
 * nobody in the directory answers to is dropped rather than emailed — the
 * composer can only ever pick from this event's address book, never type a
 * stranger into a blast.
 */
export function selectRecipients(
  directory: readonly AnnouncePerson[],
  selected: readonly string[]
): AnnouncePerson[] {
  const wanted = new Set(selected.map(normalize))
  return directory.filter(person => wanted.has(person.email))
}
