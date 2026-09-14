import { serverSupabaseClient } from '#supabase/server'
import { z } from 'zod'
import { MAX_PLUS_ONES } from '#shared/types/rsvp'
import type { Database } from '~/types/database.types'

const bodySchema = z.object({
  // null clears the reply (back to "no reply yet").
  status: z.enum(['going', 'maybe', 'no']).nullable(),
  // Clamped to the shared cap (mirrors the CHECK constraint) so a crafted body can't inflate.
  plusOnes: z.number().int().min(0).max(MAX_PLUS_ONES).optional().default(0)
})

/**
 * An admin RSVPs on a guest's behalf — for the person who told the host in
 * person "we're coming, plus two" and will never open the e-vite. Admin-only.
 * Runs under the caller's own session (RLS): event_invites is admin-all, and
 * rsvps has admin write policies for the member mirror, so the policies — not
 * this route — are the boundary. Writes go through `recordInviteRsvp`, the same
 * writer the one-click e-vite link uses, so both RSVP stores stay in step.
 */
export default defineEventHandler(async (event) => {
  const { userId } = await requireUser(event)

  const eventId = getRouterParam(event, 'id')
  const inviteId = getRouterParam(event, 'inviteId')
  if (!eventId || !inviteId) throw createError({ statusCode: 400, statusMessage: 'Missing event or invite id' })

  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid RSVP' })
  const { status, plusOnes } = parsed.data

  // RLS-scoped client: runs as the signed-in user via their session cookie.
  const db = await serverSupabaseClient<Database>(event)
  await requireAdmin(db, userId)

  const { data: invite, error } = await db
    .from('event_invites')
    .select('id, event_id, email')
    .eq('id', inviteId)
    .eq('event_id', eventId)
    .maybeSingle()
  if (error) {
    throw createError({ statusCode: 500, statusMessage: 'Could not load the guest', data: { cause: error.message, code: error.code } })
  }
  if (!invite) throw createError({ statusCode: 404, statusMessage: 'Guest not found on this event' })

  const recorded = await recordInviteRsvp(db, invite, { status, plusOnes })
  return { ok: true, ...recorded }
})
