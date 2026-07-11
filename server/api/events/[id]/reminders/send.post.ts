import { serverSupabaseClient } from '#supabase/server'
import type { Database } from '~/types/database.types'

/**
 * Manual "remind non-responders now" — the admin-triggered counterpart to the
 * daily reminder cron. Emails every invitee who was e-vited (`sent_at`) but hasn't
 * RSVP'd (`rsvp` null) for this event, ignoring the checkpoint schedule + the
 * throttle (the admin explicitly asked to send now). Admin-only, RLS-scoped.
 */
export default defineEventHandler(async (event) => {
  const { user, userId } = await requireUser(event)

  const eventId = getRouterParam(event, 'id')
  if (!eventId) throw createError({ statusCode: 400, statusMessage: 'Missing event id' })

  const db = await serverSupabaseClient<Database>(event)
  await requireAdmin(db, userId)

  const { data: ev } = await db.from('events').select('title, event_date').eq('id', eventId).single()
  if (!ev) throw createError({ statusCode: 404, statusMessage: 'Event not found' })

  const { data: invites, error: queueError } = await db
    .from('event_invites')
    .select('id, email, token')
    .eq('event_id', eventId)
    .is('rsvp', null)
    .not('sent_at', 'is', null)
  if (queueError) throw createError({ statusCode: 500, statusMessage: 'Could not load the guest list', data: { cause: queueError.message } })
  const queue = invites ?? []
  if (!queue.length) return { ok: true, sent: 0, failed: 0, error: null }

  const { resendApiKey, resendFrom } = requireEmailConfig(event)
  const origin = resolveOrigin(event)
  const daysLeft = Math.max(0, daysUntil(new Date(), ev.event_date))

  const { sent, failed, error } = await sendEventReminders(db, {
    apiKey: resendApiKey,
    from: resendFrom,
    replyTo: user.email ?? undefined,
    eventTitle: ev.title,
    eventDate: ev.event_date ? formatEmailDate(ev.event_date) : null,
    daysLeft,
    origin,
    appUrl: `${origin}/overview`,
    invites: queue
  })

  // An attempt was made (the empty-queue case returned above), so log the outcome
  // — success, partial, or total failure — to the admin Comms log.
  const { error: logError } = await db.from('comms_log').insert({
    event_id: eventId,
    kind: 'reminder',
    subject: `Reminder — ${ev.title}`,
    recipient_count: sent,
    failed_count: failed,
    status: commsStatus(sent, failed),
    error,
    sent_by: userId
  })
  if (logError) console.error('[events/reminders/send] comms_log insert failed -', logError.message)

  return { ok: true, sent, failed, error }
})
