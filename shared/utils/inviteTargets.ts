import { z } from 'zod'
import { uniqueEmails } from './email'

const bodySchema = z.object({
  emails: z.array(z.string().trim().email()).min(1).max(50)
})

/** Optional recipient filter for the e-vite send route. `null` means "everyone
 *  still unsent" (the default blast); a list narrows the send to those guests —
 *  how the People tab e-vites one person without emailing the whole queue.
 *  Emails come back lowercased + deduped; anything malformed is rejected. */
export function parseInviteTargets(body: unknown): string[] | null {
  if (body == null || (typeof body === 'object' && !('emails' in body))) return null
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) throw new Error('Invalid recipient list')
  return uniqueEmails(parsed.data.emails)
}
