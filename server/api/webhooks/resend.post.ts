import { serverSupabaseServiceRole } from '#supabase/server'
import type { Database } from '~/types/database.types'

/**
 * Resend (Svix) webhook → stamps delivery/open/click/bounce on the matching
 * event_invites row (correlated by the Resend message id). Public, but verified
 * by the signing secret; runs via the service role below RLS.
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

  const admin = serverSupabaseServiceRole<Database>(event)
  const stamp = new Date().toISOString()
  // A Resend id belongs to exactly one send, which lives in either table:
  // e-vites/reminders on event_invites, announcement blasts on comms_recipients.
  // Stamp both — the non-matching table is a cheap indexed no-op.
  // `column` is a fixed key from RESEND_EVENT_COLUMN, but a computed key widens to
  // an index signature — cast to the row Update type at this validated boundary.
  const [invites, recipients] = await Promise.all([
    admin
      .from('event_invites')
      .update({ [column]: stamp } as Database['public']['Tables']['event_invites']['Update'], { count: 'exact' })
      .eq('resend_id', emailId),
    admin
      .from('comms_recipients')
      .update({ [column]: stamp } as Database['public']['Tables']['comms_recipients']['Update'], { count: 'exact' })
      .eq('resend_id', emailId)
  ])

  // Always 200 so Resend doesn't retry forever, but never silently — a swallowed
  // miss here is exactly why "Resend shows opens, the app shows none" is so hard to
  // diagnose. Logs land in the function logs and distinguish the failure modes.
  for (const [table, res] of [['event_invites', invites], ['comms_recipients', recipients]] as const) {
    if (res.error) console.error(`[webhooks/resend] failed to stamp ${column} on ${table} for email_id ${emailId} -`, res.error.message)
  }
  const stamped = (invites.count ?? 0) + (recipients.count ?? 0)
  if (!stamped && !invites.error && !recipients.error) {
    // Verified + parsed, but nothing carries this Resend id: the row was sent
    // before resend_id was stored, or sent from a different route/sender.
    console.warn(`[webhooks/resend] ${payload.type} matched no invite or announcement recipient (email_id ${emailId})`)
  } else if (stamped) {
    console.info(`[webhooks/resend] stamped ${column} on ${stamped} row(s) (email_id ${emailId})`)
  }
  return { ok: true }
})
