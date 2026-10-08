import { type AnnounceRecipient, type AnnounceScope, announceIncludesRsvpButtons } from '../../shared/utils/announce'
import { buildAnnounceEmail } from '../../shared/utils/email'
import type { AnnounceMail } from './email'

/** A guest-list row for the announcement's event, as far as the mail needs it. */
export interface AnnounceGuest {
  readonly id: string
  readonly email: string
  readonly token: string
}

/**
 * Builds each recipient's own copy of an announcement: greeted by name and tied
 * to their guest-list row when they're on it (so opens count toward that guest).
 * For the `unopened` audience — people who haven't seen the e-vite, so haven't
 * replied either — each copy closes with that guest's one-click RSVP buttons, so
 * answering the note needs no sign-in.
 */
export function buildAnnounceMails(opts: {
  readonly recipients: readonly AnnounceRecipient[]
  readonly guests: readonly AnnounceGuest[]
  readonly scope: AnnounceScope
  readonly origin: string
  readonly eventTitle: string
  readonly eventDate: string | null
  readonly message: string
  readonly subject?: string
}): AnnounceMail[] {
  const guestByEmail = new Map(opts.guests.map(g => [g.email, g]))
  const withRsvpButtons = announceIncludesRsvpButtons(opts.scope)
  return opts.recipients.map((recipient) => {
    const guest = guestByEmail.get(recipient.email)
    const mail = buildAnnounceEmail({
      eventTitle: opts.eventTitle,
      eventDate: opts.eventDate,
      message: opts.message,
      subject: opts.subject,
      link: `${opts.origin}/overview`,
      recipientName: recipient.name,
      rsvpUrl: withRsvpButtons && guest ? `${opts.origin}/rsvp?token=${guest.token}` : null
    })
    return { email: recipient.email, inviteId: guest?.id ?? null, ...mail }
  })
}
