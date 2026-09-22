import { serverSupabaseClient } from '#supabase/server'
import type { Database } from '~/types/database.types'

/**
 * This event's address book: everyone the composer may mail, with their reply
 * and their standing in the club, so the recipient picker can show who each
 * person is instead of a bare address.
 *
 * Read-only, same admin gate and same RLS-scoped client as the send, and the
 * send validates against this same directory — so what the admin picks from is
 * exactly what it's allowed to mail.
 */
export default defineEventHandler(async (event) => {
  const { userId } = await requireUser(event)

  const eventId = getRouterParam(event, 'id')
  if (!eventId) throw createError({ statusCode: 400, statusMessage: 'Missing event id' })

  const db = await serverSupabaseClient<Database>(event)
  await requireAdmin(db, userId)

  return { people: await loadAnnounceDirectory(db, eventId) }
})
