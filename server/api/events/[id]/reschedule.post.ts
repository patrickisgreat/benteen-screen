import { serverSupabaseClient } from '#supabase/server'
import type { Database } from '~/types/database.types'

/**
 * Moves an event to a new date and (unless told not to) emails everyone it
 * concerns — every e-vited guest plus anyone who RSVP'd in the app. RSVPs are
 * left exactly as they are; each person's copy says where theirs stands and
 * gives them one-click buttons to change it. Admin-only, RLS-scoped.
 *
 * The event is updated before anything is sent: a notice about a date the app
 * doesn't show yet would be worse than a moved date with a failed notice, which
 * the result reports (`failed`/`error`) so the admin can follow up.
 */
export default defineEventHandler(async (event) => {
  const { user, userId } = await requireUser(event)

  const eventId = getRouterParam(event, 'id')
  if (!eventId) throw createError({ statusCode: 400, statusMessage: 'Missing event id' })

  const db = await serverSupabaseClient<Database>(event)
  await requireAdmin(db, userId)

  const parsed = parseRescheduleRequest(await readBody(event))
  if (!parsed.ok) throw createError({ statusCode: 400, statusMessage: parsed.error })
  const request = parsed.value

  const { data: ev } = await db.from('events').select('title, event_date, start_time').eq('id', eventId).single()
  if (!ev) throw createError({ statusCode: 404, statusMessage: 'Event not found' })
  if (!isRescheduled(ev, request)) throw createError({ statusCode: 400, statusMessage: 'That is the date it already has' })

  // Resolve who to tell (and that email can be sent at all) before moving
  // anything, so a failure here leaves the event untouched.
  const recipients = request.notify ? await resolveDateChangeAudience(db, eventId) : []
  const emailConfig = recipients.length ? requireEmailConfig(event) : null

  const { error: updateError } = await db
    .from('events')
    .update({
      event_date: request.eventDate,
      start_time: request.startTime,
      previous_event_date: ev.event_date,
      previous_start_time: ev.start_time,
      rescheduled_at: new Date().toISOString()
    })
    .eq('id', eventId)
  if (updateError) {
    throw createError({ statusCode: 500, statusMessage: 'Could not move the event', data: { cause: updateError.message, code: updateError.code } })
  }

  if (!emailConfig) return { ok: true, moved: true, sent: 0, failed: 0, error: null }

  const hostName = inviterNameFromClaims(user)
  const newDate = formatEmailDate(request.eventDate)
  const mails = buildDateChangeMails({
    recipients,
    origin: resolveOrigin(event),
    eventTitle: ev.title,
    oldDate: formatEmailDate(ev.event_date) || null,
    newDate,
    newTime: request.startTime,
    hostName,
    note: request.note
  })
  const { sent, failed, error, messages } = await sendAnnounce({
    apiKey: emailConfig.resendApiKey,
    from: personalFrom(emailConfig.resendFrom, hostName),
    replyTo: user.email ?? undefined,
    recipients: mails
  })
  await recordSend(db, { eventId, kind: 'date_change', subject: `Date change — ${ev.title} → ${newDate}`, sentBy: userId, sent, failed, error, messages })

  return { ok: true, moved: true, sent, failed, error }
})
