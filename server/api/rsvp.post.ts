import { serverSupabaseServiceRole } from '#supabase/server'
import { z } from 'zod'
import { MAX_PLUS_ONES } from '#shared/types/rsvp'
import type { Database } from '~/types/database.types'

const bodySchema = z.object({
  token: z.string().min(8).max(128),
  status: z.enum(['going', 'maybe', 'no']),
  // Additional guests the invitee is bringing. Only meaningful when going; clamped
  // to the shared cap (mirrors the CHECK constraint) so a crafted body can't inflate.
  plusOnes: z.number().int().min(0).max(MAX_PLUS_ONES).optional().default(0)
})

/**
 * Public one-click RSVP from an e-vite. Authenticated by the opaque invite token
 * (not a session), so it runs via the service role below RLS. Records the reply
 * on event_invites and mirrors it into rsvps when the email maps to a member, so
 * the in-app headcount stays in sync (`recordInviteRsvp`).
 */
export default defineEventHandler(async (event) => {
  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid RSVP' })
  const { token, status, plusOnes } = parsed.data

  const admin = serverSupabaseServiceRole<Database>(event)
  const { data: invite } = await admin
    .from('event_invites')
    .select('id, event_id, email')
    .eq('token', token)
    .maybeSingle()
  if (!invite) throw createError({ statusCode: 404, statusMessage: 'Invitation not found' })

  // The reply came from the e-vite link itself, so it also counts as a click.
  const recorded = await recordInviteRsvp(admin, invite, { status, plusOnes, markClicked: true })
  return { ok: true, ...recorded }
})
