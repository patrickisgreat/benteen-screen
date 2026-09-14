import { serverSupabaseClient } from '#supabase/server'
import { toRsvpStatus } from '#shared/types/rsvp'
import type { Database } from '~/types/database.types'

/**
 * Email a guest that the admin recorded an RSVP on their behalf, with one-click
 * links to change it (and the app, when they're a member). Admin-only,
 * RLS-scoped. Sends whatever reply is currently stored — 409 when there is none
 * to confirm. Logged to the Comms log like every other admin send; a failed send
 * is reported in the result (not thrown) so the UI can show the reason.
 */
export default defineEventHandler(async (event) => {
  const { user, userId } = await requireUser(event)

  const eventId = getRouterParam(event, 'id')
  const inviteId = getRouterParam(event, 'inviteId')
  if (!eventId || !inviteId) throw createError({ statusCode: 400, statusMessage: 'Missing event or invite id' })

  const db = await serverSupabaseClient<Database>(event)
  await requireAdmin(db, userId)

  const { data: invite, error: inviteError } = await db
    .from('event_invites')
    .select('id, email, token, rsvp, plus_ones')
    .eq('id', inviteId)
    .eq('event_id', eventId)
    .maybeSingle()
  if (inviteError) {
    throw createError({ statusCode: 500, statusMessage: 'Could not load the guest', data: { cause: inviteError.message, code: inviteError.code } })
  }
  if (!invite) throw createError({ statusCode: 404, statusMessage: 'Guest not found on this event' })
  if (!invite.rsvp) throw createError({ statusCode: 409, statusMessage: 'They have no RSVP to confirm yet' })

  const { data: ev } = await db.from('events').select('title, event_date').eq('id', eventId).single()
  if (!ev) throw createError({ statusCode: 404, statusMessage: 'Event not found' })

  // Members get a sign-in link too; email-only guests only have the one-click links.
  const { data: member } = await db.from('profiles').select('id').ilike('email', invite.email).maybeSingle()

  const { resendApiKey, resendFrom } = requireEmailConfig(event)
  const origin = resolveOrigin(event)
  const mail = buildRsvpConfirmationEmail({
    eventTitle: ev.title,
    eventDate: ev.event_date ? formatEmailDate(ev.event_date) : null,
    hostName: inviterNameFromClaims(user),
    status: toRsvpStatus(invite.rsvp),
    plusOnes: invite.plus_ones,
    rsvpUrl: `${origin}/rsvp?token=${invite.token}`,
    appUrl: member ? `${origin}/overview` : null
  })

  let error: string | null = null
  try {
    await sendEmail(resendApiKey, resendFrom, { to: invite.email, subject: mail.subject, html: mail.html, text: mail.text, replyTo: user.email ?? undefined })
  } catch (err) {
    error = err instanceof Error ? err.message : 'Failed to send email'
  }
  const sent = error ? 0 : 1
  const failed = error ? 1 : 0

  const { error: logError } = await db.from('comms_log').insert({
    event_id: eventId,
    kind: 'rsvp_confirmation',
    subject: mail.subject,
    recipient_count: sent,
    failed_count: failed,
    status: commsStatus(sent, failed),
    error,
    sent_by: userId
  })
  if (logError) console.error('[events/invites/rsvp-confirmation] comms_log insert failed -', logError.message)

  return { ok: true, sent, failed, error }
})
