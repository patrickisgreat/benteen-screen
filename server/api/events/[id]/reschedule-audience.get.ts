import { serverSupabaseClient } from '#supabase/server'
import type { Database } from '~/types/database.types'

/**
 * Who a date change for this event would email, counted by where their RSVP
 * stands — so the "Move date" dialog can say exactly who hears about it before
 * anything is changed. Admin-only, RLS-scoped; reads only.
 */
export default defineEventHandler(async (event) => {
  const { userId } = await requireUser(event)

  const eventId = getRouterParam(event, 'id')
  if (!eventId) throw createError({ statusCode: 400, statusMessage: 'Missing event id' })

  const db = await serverSupabaseClient<Database>(event)
  await requireAdmin(db, userId)

  return summarizeDateChangeAudience(await resolveDateChangeAudience(db, eventId))
})
