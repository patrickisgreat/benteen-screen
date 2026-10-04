import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~/types/database.types'
import { isRsvpStatus, type RsvpStatus } from '../../shared/types/rsvp'
import { buildDateChangeEmail } from '../../shared/utils/email'
import type { RescheduleAudience } from '../../shared/utils/reschedule'
import type { AnnounceMail } from './email'

type Db = SupabaseClient<Database>

/** One person to tell about a date change, with where their RSVP stands. */
export interface DateChangeRecipient {
  readonly email: string
  readonly name: string | null
  /** Their guest-list row and its one-click token; null for an app-only member. */
  readonly inviteId: string | null
  readonly token: string | null
  readonly rsvp: RsvpStatus | null
}

/** Narrow a stored reply; anything unexpected reads as "no reply". */
function toReply(value: string | null): RsvpStatus | null {
  return value && isRsvpStatus(value) ? value : null
}

/**
 * Everyone a date change concerns: every guest who was sent the e-vite (unless
 * their address bounced), plus members who RSVP'd in the app without being on
 * the guest list. A person in both is told once, as a guest — that copy carries
 * their one-click links. Runs under the admin's RLS-scoped client.
 */
export async function resolveDateChangeAudience(db: Db, eventId: string): Promise<DateChangeRecipient[]> {
  const [guests, rsvps] = await Promise.all([
    db.from('event_invites')
      .select('id, email, display_name, token, rsvp')
      .eq('event_id', eventId)
      .not('sent_at', 'is', null)
      .is('bounced_at', null),
    db.from('rsvps').select('user_id, status').eq('event_id', eventId)
  ])
  if (guests.error) throw guests.error
  if (rsvps.error) throw rsvps.error

  const recipients: DateChangeRecipient[] = (guests.data ?? []).map(g => ({
    email: g.email,
    name: g.display_name,
    inviteId: g.id,
    token: g.token,
    rsvp: toReply(g.rsvp)
  }))

  const memberReplies = new Map((rsvps.data ?? []).map(r => [r.user_id, r.status]))
  if (!memberReplies.size) return recipients
  const profiles = await db.from('profiles').select('id, email, display_name').in('id', [...memberReplies.keys()])
  if (profiles.error) throw profiles.error

  const told = new Set(recipients.map(r => r.email.toLowerCase()))
  for (const profile of profiles.data ?? []) {
    const email = profile.email?.trim().toLowerCase()
    if (!email || told.has(email)) continue
    told.add(email)
    recipients.push({
      email,
      name: profile.display_name,
      inviteId: null,
      token: null,
      rsvp: toReply(memberReplies.get(profile.id) ?? null)
    })
  }
  return recipients
}

/** Counts by reply, plus someone to preview the email as (a named "going" guest if there is one). */
export function summarizeDateChangeAudience(recipients: readonly DateChangeRecipient[]): RescheduleAudience {
  const count = (rsvp: RsvpStatus | null): number => recipients.filter(r => r.rsvp === rsvp).length
  const sample = recipients.find(r => r.rsvp === 'going' && r.name) ?? recipients.find(r => r.name) ?? recipients[0] ?? null
  return {
    total: recipients.length,
    going: count('going'),
    maybe: count('maybe'),
    declined: count('no'),
    noReply: count(null),
    sample: sample ? { name: sample.name, rsvp: sample.rsvp } : null
  }
}

/** Builds each person's own copy of the date-change notice. */
export function buildDateChangeMails(opts: {
  readonly recipients: readonly DateChangeRecipient[]
  readonly origin: string
  readonly eventTitle: string
  readonly oldDate: string | null
  readonly newDate: string
  readonly newTime: string | null
  readonly hostName: string | null
  readonly note: string | null
}): AnnounceMail[] {
  return opts.recipients.map((recipient) => {
    const mail = buildDateChangeEmail({
      eventTitle: opts.eventTitle,
      oldDate: opts.oldDate,
      newDate: opts.newDate,
      newTime: opts.newTime,
      hostName: opts.hostName,
      recipientName: recipient.name,
      note: opts.note,
      rsvp: recipient.rsvp,
      rsvpUrl: recipient.token ? `${opts.origin}/rsvp?token=${recipient.token}` : null,
      appUrl: `${opts.origin}/overview`
    })
    return { email: recipient.email, inviteId: recipient.inviteId, ...mail }
  })
}
