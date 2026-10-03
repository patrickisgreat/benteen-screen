import type { SupabaseClient } from '@supabase/supabase-js'
import type { AnnounceRecipient, AnnounceScope } from '#shared/utils/announce'
import type { Database } from '~/types/database.types'
import { isUnopenedInvite } from '../../shared/utils/unopenedInvite'

interface NamedEmailRow {
  email: string | null
  display_name: string | null
}

/** Lowercase, trim, dedupe by email; the first non-empty name wins. */
function toRecipients(rows: readonly NamedEmailRow[]): AnnounceRecipient[] {
  const byEmail = new Map<string, AnnounceRecipient>()
  for (const row of rows) {
    const email = row.email?.trim().toLowerCase()
    if (!email) continue
    const existing = byEmail.get(email)
    if (!existing) byEmail.set(email, { email, name: row.display_name ?? null })
    else if (!existing.name && row.display_name) existing.name = row.display_name
  }
  return [...byEmail.values()]
}

/**
 * Who an announcement reaches, for one scope. Runs under the admin's RLS-scoped
 * client (an admin can read every table involved). Used both to preview the
 * audience in the composer and to send, so the count the admin saw is the count
 * that goes out.
 */
export async function resolveAnnounceAudience(
  db: SupabaseClient<Database>,
  eventId: string,
  scope: AnnounceScope,
  emails: readonly string[]
): Promise<AnnounceRecipient[]> {
  switch (scope) {
    case 'guests': {
      const { data, error } = await db.from('event_invites').select('email, display_name').eq('event_id', eventId)
      if (error) throw error
      return toRecipients(data ?? [])
    }
    case 'unopened': {
      const { data, error } = await db
        .from('event_invites')
        .select('email, display_name, sent_at, opened_at, clicked_at, bounced_at, rsvp')
        .eq('event_id', eventId)
      if (error) throw error
      return toRecipients((data ?? []).filter(isUnopenedInvite))
    }
    case 'going': {
      // Both RSVP stores: members who tapped going in-app + e-vite guests who replied going.
      const [rsvps, evites] = await Promise.all([
        db.from('rsvps').select('user_id').eq('event_id', eventId).eq('status', 'going'),
        db.from('event_invites').select('email, display_name').eq('event_id', eventId).eq('rsvp', 'going')
      ])
      if (rsvps.error) throw rsvps.error
      if (evites.error) throw evites.error
      const ids = (rsvps.data ?? []).map(row => row.user_id)
      const profiles = ids.length
        ? await db.from('profiles').select('email, display_name').in('id', ids)
        : { data: [], error: null }
      if (profiles.error) throw profiles.error
      return toRecipients([...(profiles.data ?? []), ...(evites.data ?? [])])
    }
    case 'members': {
      const { data, error } = await db.from('invites').select('email, display_name').not('accepted_at', 'is', null)
      if (error) throw error
      return toRecipients(data ?? [])
    }
    case 'invited': {
      const { data, error } = await db.from('invites').select('email, display_name')
      if (error) throw error
      return toRecipients(data ?? [])
    }
    case 'custom': {
      // Names where we know them (signed-in members); the picker already normalized the emails.
      const { data, error } = await db.from('profiles').select('email, display_name').in('email', [...emails])
      if (error) throw error
      const nameByEmail = new Map((data ?? []).filter(p => p.email).map(p => [p.email!.toLowerCase(), p.display_name]))
      return toRecipients(emails.map(email => ({ email, display_name: nameByEmail.get(email) ?? null })))
    }
    default: {
      const exhaustive: never = scope
      throw new Error(`Unknown announce scope: ${String(exhaustive)}`)
    }
  }
}
