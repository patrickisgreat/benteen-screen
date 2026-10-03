import { serverSupabaseServiceRole } from '#supabase/server'
import type { Database } from '~/types/database.types'

/**
 * Resend (Svix) webhook → stamps delivery/open/click/bounce on the matching
 * email (correlated by the Resend message id), for every kind of send. Public,
 * but verified by the signing secret; runs via the service role below RLS.
 *
 * Register it at the canonical host (the one that answers without redirecting):
 * webhook senders don't follow a 308 from the apex to `www`, so an endpoint on
 * the redirecting host fails every delivery. `syncEmailStatuses` is the safety
 * net when events don't arrive.
 */
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)
  const secret = config.resendWebhookSecret
  if (!secret) throw createError({ statusCode: 500, statusMessage: 'Webhook secret not configured' })

  const raw = await readRawBody(event)
  if (!raw) throw createError({ statusCode: 400, statusMessage: 'Empty body' })
  const body = raw.toString()

  const verified = verifySvixSignature({
    secret,
    id: getHeader(event, 'svix-id') ?? '',
    timestamp: getHeader(event, 'svix-timestamp') ?? '',
    body,
    signatureHeader: getHeader(event, 'svix-signature') ?? ''
  })
  if (!verified) throw createError({ statusCode: 401, statusMessage: 'Invalid signature' })

  let payload: { type?: string, data?: { email_id?: string } }
  try {
    payload = JSON.parse(body)
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Invalid JSON' })
  }

  const column = payload.type ? RESEND_EVENT_COLUMN[payload.type] : undefined
  const emailId = payload.data?.email_id
  if (!column || !emailId) return { ok: true } // event we don't track — ack it anyway

  // Always 200 so Resend doesn't retry forever, but never silently — a swallowed
  // miss here is exactly why "Resend shows opens, the app shows none" is so hard to
  // diagnose. Logs land in the function logs and distinguish the failure modes.
  try {
    const target = await stampEmailEvent(serverSupabaseServiceRole<Database>(event), column, emailId)
    if (target === 'unmatched') {
      // Verified + parsed, but nothing carries this Resend id: an email this app
      // doesn't track (the admin digest, a club welcome) or one sent elsewhere.
      console.warn(`[webhooks/resend] ${payload.type} matched no email (email_id ${emailId})`)
    } else {
      console.info(`[webhooks/resend] stamped ${column} on the ${target} (email_id ${emailId})`)
    }
  } catch (e) {
    console.error(`[webhooks/resend] failed to stamp ${column} for email_id ${emailId} -`, e instanceof Error ? e.message : e)
  }
  return { ok: true }
})
