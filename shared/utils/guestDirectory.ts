/** Everyone an admin could add to an event's guest list, gathered from the three
 *  places people live: signed-in members (`profiles`), the club allowlist
 *  (`invites`), and past events' guest lists (`event_invites`). Pure helpers so
 *  the merge + search rules are unit-testable without Supabase. */

export const GUEST_SOURCES = ['member', 'roster', 'past-guest'] as const
export type GuestSource = (typeof GUEST_SOURCES)[number]

export interface GuestCandidate {
  email: string
  display_name: string | null
  /** Mobile number (E.164) if any source knows it — only past guest lists do. */
  phone: string | null
  source: GuestSource
}

/** A row from any of the three source tables — an email, optional name, and
 *  (for past guest lists) an optional phone. */
export interface GuestRow {
  email: string | null
  display_name: string | null
  phone?: string | null
}

export const GUEST_SOURCE_LABELS: Record<GuestSource, string> = {
  'member': 'Member',
  'roster': 'On the roster',
  'past-guest': 'Past guest'
}

/** Dedupe by (lowercased) email. A member beats a roster entry beats a past guest
 *  for the `source` tag, and the first non-empty display name / phone wins so a
 *  bare email from an old guest list still shows the name their profile carries,
 *  and a number typed for one event follows the person to the next. */
export function mergeGuestCandidates(
  members: readonly GuestRow[],
  roster: readonly GuestRow[],
  pastGuests: readonly GuestRow[]
): GuestCandidate[] {
  const byEmail = new Map<string, GuestCandidate>()
  const absorb = (rows: readonly GuestRow[], source: GuestSource): void => {
    for (const row of rows) {
      const email = row.email?.trim().toLowerCase()
      if (!email) continue
      const name = row.display_name?.trim() || null
      const phone = row.phone?.trim() || null
      const existing = byEmail.get(email)
      if (existing) {
        if (!existing.display_name && name) existing.display_name = name
        if (!existing.phone && phone) existing.phone = phone
      } else {
        byEmail.set(email, { email, display_name: name, phone, source })
      }
    }
  }
  absorb(members, 'member')
  absorb(roster, 'roster')
  absorb(pastGuests, 'past-guest')
  return [...byEmail.values()].sort((a, b) => (a.display_name ?? a.email).localeCompare(b.display_name ?? b.email))
}

/** Live-search matches for a query: name or email contains it (case-insensitive),
 *  minus anyone already on the list. Empty query → no matches (nothing to search). */
export function searchGuestCandidates(
  candidates: readonly GuestCandidate[],
  query: string,
  exclude: Iterable<string> = [],
  limit = 8
): GuestCandidate[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const skip = new Set([...exclude].map(e => e.toLowerCase()))
  return candidates
    .filter(c => !skip.has(c.email))
    .filter(c => c.email.includes(q) || (c.display_name?.toLowerCase().includes(q) ?? false))
    .slice(0, limit)
}
