import { serverSupabaseClient } from '#supabase/server'
import type { Database } from '~/types/database.types'

/**
 * "Refresh delivery status" — pulls the latest delivery/open state from Resend
 * for this event's recent emails and fills in whatever the webhook didn't
 * deliver. Admin-only, RLS-scoped (admins may update `email_messages`; the
 * guest rows follow via the sync trigger). Returns how many were checked and
 * how many gained a new stamp.
 */
export default defineEventHandler(async (event) => {
  const { userId } = await requireUser(event)

  const eventId = getRouterParam(event, 'id')
  if (!eventId) throw createError({ statusCode: 400, statusMessage: 'Missing event id' })

  const db = await serverSupabaseClient<Database>(event)
  await requireAdmin(db, userId)

  const { resendApiKey } = requireEmailConfig(event)
  try {
    return { ok: true, ...(await syncEmailStatuses(db, resendApiKey, { eventId })) }
  } catch (e) {
    throw createError({ statusCode: 502, statusMessage: 'Could not refresh delivery status', data: { cause: e instanceof Error ? e.message : String(e) } })
  }
})
