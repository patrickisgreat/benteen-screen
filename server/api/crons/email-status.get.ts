import { serverSupabaseServiceRole } from '#supabase/server'
import type { Database } from '~/types/database.types'

/**
 * Daily delivery-status sync. Vercel Cron hits this (GET) once a day,
 * authenticated by the CRON_SECRET bearer token, and pulls the latest
 * delivery/open state from Resend for every recent email — the safety net for
 * webhook events that never arrived. Runs as the service role (no session).
 */
export default defineEventHandler(async (event) => {
  requireCron(event)
  const { resendApiKey } = requireEmailConfig(event)
  const result = await syncEmailStatuses(serverSupabaseServiceRole<Database>(event), resendApiKey)
  return { ok: true, ...result }
})
