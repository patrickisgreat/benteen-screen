import { z } from 'zod'
import { htmlToText, uniqueEmails } from './email'

/** Who an event announcement goes to. This night's audiences first, then out to
 *  the whole club. */
export const ANNOUNCE_SCOPES = ['guests', 'unopened', 'going', 'custom', 'members', 'invited'] as const
export type AnnounceScope = (typeof ANNOUNCE_SCOPES)[number]

export interface AnnounceScopeOption {
  readonly value: AnnounceScope
  readonly label: string
  readonly description: string
}

/** The audience choices as the composer shows them — a label plus a plain
 *  description of exactly who is included, so "everyone" is never a surprise. */
export const ANNOUNCE_SCOPE_OPTIONS: readonly AnnounceScopeOption[] = [
  { value: 'guests', label: 'This night\'s guest list', description: 'Everyone on the e-vite list for this event, whether or not they\'ve replied.' },
  { value: 'unopened', label: 'Haven\'t opened the e-vite', description: 'Guests who were sent this night\'s e-vite and show no sign of seeing it: no open, no click, no reply. Your message goes out with their own RSVP buttons.' },
  { value: 'going', label: 'Going to this night', description: 'Only people who RSVP\'d going, in the app or by e-vite.' },
  { value: 'custom', label: 'Pick specific people', description: 'Search the directory and choose exactly who gets it.' },
  { value: 'members', label: 'All members', description: 'Everyone who has signed in to the app, across all events.' },
  { value: 'invited', label: 'Whole club roster', description: 'Everyone ever invited to the club, joined or not. The biggest list.' }
]

/** The sensible default: the people invited to this night, not the whole club. */
export const DEFAULT_ANNOUNCE_SCOPE: AnnounceScope = 'guests'

/** Max hand-picked recipients in one blast. */
export const ANNOUNCE_CUSTOM_LIMIT = 100

/** One person an announcement will reach — what the preview shows the admin. */
export interface AnnounceRecipient {
  email: string
  name: string | null
}

const bodySchema = z.object({
  eventId: z.string().uuid(),
  subject: z.string().trim().max(200).optional(),
  // Rich HTML from the composer's editor (markup inflates length — hence 10k).
  message: z.string().max(10000).optional(),
  scope: z.enum(ANNOUNCE_SCOPES),
  emails: z.array(z.string().trim().email()).max(ANNOUNCE_CUSTOM_LIMIT).optional(),
  preview: z.boolean().optional()
})

interface AnnounceRequestBase {
  eventId: string
  subject: string | undefined
  scope: AnnounceScope
  /** Hand-picked recipients (lowercased + deduped); only meaningful for `custom`. */
  emails: string[]
}

/** A preview only resolves the audience; a send also needs a real message. */
export type AnnounceRequest
  = (AnnounceRequestBase & { preview: true })
    | (AnnounceRequestBase & { preview: false, message: string })

export type ParsedAnnounce = { ok: true, value: AnnounceRequest } | { ok: false, error: string }

/**
 * Validate an announce request body at the boundary. Shared by the route and the
 * composer so the two never disagree about what a valid blast is: a `custom`
 * scope needs at least one person, and a send (not a preview) needs a message
 * with actual text, not just empty tags.
 */
export function parseAnnounceRequest(body: unknown): ParsedAnnounce {
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) return { ok: false, error: 'Invalid announcement' }
  const { eventId, subject, message, scope } = parsed.data
  const emails = uniqueEmails(parsed.data.emails ?? [])
  if (scope === 'custom' && !emails.length) return { ok: false, error: 'Pick at least one person' }
  const base: AnnounceRequestBase = { eventId, subject, scope, emails }
  if (parsed.data.preview) return { ok: true, value: { ...base, preview: true } }
  if (!message || htmlToText(message).length === 0) return { ok: false, error: 'Write a message' }
  return { ok: true, value: { ...base, preview: false, message } }
}
