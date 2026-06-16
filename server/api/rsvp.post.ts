import { serverSupabaseServiceRole } from '#supabase/server'
import { z } from 'zod'
import type { Database } from '~/types/database.types'

const bodySchema = z.object({
  token: z.string().min(8).max(128),
  status: z.enum(['going', 'maybe', 'no'])
})

/**
 * Public one-click RSVP from an e-vite. Authenticated by the opaque invite token
 * (not a session), so it runs via the service role below RLS. Records the reply
 * on event_invites and mirrors it into rsvps when the email maps to a member, so
 * the in-app headcount stays in sync.
 */
export default defineEventHandler(async (event) => {
  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid RSVP' })
  const { token, status } = parsed.data

  const admin = serverSupabaseServiceRole<Database>(event)
  const { data: invite } = await admin
    .from('event_invites')
    .select('id, event_id, email')
    .eq('token', token)
    .maybeSingle()
  if (!invite) throw createError({ statusCode: 404, statusMessage: 'Invitation not found' })

  const now = new Date().toISOString()
  await admin
    .from('event_invites')
    .update({ rsvp: status, rsvp_at: now, clicked_at: now })
    .eq('id', invite.id)

  // Mirror into the app RSVP if this invitee is also a member (case-insensitive).
  const { data: profile } = await admin.from('profiles').select('id').ilike('email', invite.email).maybeSingle()
  if (profile) {
    await admin
      .from('rsvps')
      .upsert({ event_id: invite.event_id, user_id: profile.id, status, updated_at: now }, { onConflict: 'event_id,user_id' })
  }

  return { ok: true, status }
})
