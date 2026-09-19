import { serverSupabaseClient } from '#supabase/server'
import { z } from 'zod'
import { ANNOUNCE_SCOPE_VALUES } from '#shared/utils/announce'
import type { Database } from '~/types/database.types'

const querySchema = z.object({ scope: z.enum(ANNOUNCE_SCOPE_VALUES) })

/**
 * Who a blast would go to, before it goes. The composer calls this to show the
 * audience by name and let the admin untick people — the reason a "remind the
 * folks who are coming" email can no longer land in 74 inboxes by accident.
 *
 * Reads only: same admin gate and same RLS-scoped client as the send, and the
 * same resolver, so the preview and the send can't drift apart.
 */
export default defineEventHandler(async (event) => {
  const { userId } = await requireUser(event)

  const eventId = getRouterParam(event, 'id')
  if (!eventId) throw createError({ statusCode: 400, statusMessage: 'Missing event id' })

  const db = await serverSupabaseClient<Database>(event)
  await requireAdmin(db, userId)

  const parsed = querySchema.safeParse(getQuery(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Unknown audience' })

  const recipients = await resolveAnnounceRecipients(db, eventId, parsed.data.scope)
  return { scope: parsed.data.scope, count: recipients.length, recipients }
})
