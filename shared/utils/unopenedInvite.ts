import type { EventInvite } from '#shared/types/event-invite'

/** The tracking fields that decide whether a guest has seen their e-vite. */
export type InviteTracking = Pick<EventInvite, 'sent_at' | 'opened_at' | 'clicked_at' | 'bounced_at'> & {
  rsvp: string | null
}

/**
 * Whether a guest was sent the e-vite but shows no sign of having seen it: it
 * didn't bounce, and there is no open, no click on its RSVP link, and no reply
 * by any route. These are the people worth writing to again.
 *
 * Opens are detected by an image loading, so someone who read it with images
 * off still counts as unopened; a reply or a link click covers most of those.
 */
export function isUnopenedInvite(invite: InviteTracking): boolean {
  return invite.sent_at != null
    && invite.bounced_at == null
    && invite.opened_at == null
    && invite.clicked_at == null
    && invite.rsvp == null
}
