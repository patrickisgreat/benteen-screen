import { serverSupabaseServiceRole } from '#supabase/server'
import { z } from 'zod'
import type { Database } from '~/types/database.types'

const bodySchema = z.object({
  token: z.string().min(8).max(128),
  pollId: z.string().uuid(),
  optionId: z.string().uuid()
})

/**
 * Public one-tap poll vote from an email. Authenticated by the guest's opaque
 * e-vite token (not a session), so it runs via the service role below RLS — the
 * vote is recorded as the token's guest and nobody else (`castPollVote`).
 */
export default defineEventHandler(async (event) => {
  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid vote' })
  const { token, pollId, optionId } = parsed.data

  const admin = serverSupabaseServiceRole<Database>(event)
  const { data: invite } = await admin
    .from('event_invites')
    .select('id, event_id')
    .eq('token', token)
    .maybeSingle()
  if (!invite) throw createError({ statusCode: 404, statusMessage: 'Invitation not found' })

  try {
    return { ok: true, ...(await castPollVote(admin, invite, pollId, optionId)) }
  } catch (e) {
    if (e instanceof PollVoteError) throw createError({ statusCode: e.statusCode, statusMessage: e.message })
    throw e
  }
})
