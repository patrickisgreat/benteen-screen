import { serverSupabaseClient } from '#supabase/server'
import type { Database } from '~/types/database.types'

/**
 * Creates a poll for an event and emails it to the guest list: everyone who was
 * sent the e-vite and whose address hasn't bounced. Each guest gets their own
 * copy with one button per choice (their tokenized vote links). Admin-only,
 * RLS-scoped. The poll exists even if no email could be sent — the result
 * reports sent/failed so the UI can say so.
 */
export default defineEventHandler(async (event) => {
  const { user, userId } = await requireUser(event)

  const eventId = getRouterParam(event, 'id')
  if (!eventId) throw createError({ statusCode: 400, statusMessage: 'Missing event id' })

  const db = await serverSupabaseClient<Database>(event)
  await requireAdmin(db, userId)

  const parsed = parsePollRequest(await readBody(event))
  if (!parsed.ok) throw createError({ statusCode: 400, statusMessage: parsed.error })
  const { question, options, note } = parsed.value

  const { data: ev } = await db.from('events').select('title, event_date').eq('id', eventId).single()
  if (!ev) throw createError({ statusCode: 404, statusMessage: 'Event not found' })

  const { data: guests, error: guestsError } = await db
    .from('event_invites')
    .select('id, email, display_name, token')
    .eq('event_id', eventId)
    .not('sent_at', 'is', null)
    .is('bounced_at', null)
  if (guestsError) {
    throw createError({ statusCode: 500, statusMessage: 'Could not load the guest list', data: { cause: guestsError.message, code: guestsError.code } })
  }
  if (!guests?.length) throw createError({ statusCode: 409, statusMessage: 'No one has been e-vited to this event yet' })

  // Resolve the email config before creating anything, so a missing key can't
  // leave behind a poll nobody was asked.
  const { resendApiKey, resendFrom } = requireEmailConfig(event)

  let poll: Awaited<ReturnType<typeof createPoll>>
  try {
    poll = await createPoll(db, { eventId, question, options, createdBy: userId })
  } catch (e) {
    throw createError({ statusCode: 500, statusMessage: 'Could not create the poll', data: { cause: e instanceof Error ? e.message : String(e) } })
  }

  const hostName = inviterNameFromClaims(user)
  const mails = buildPollMails({
    guests,
    origin: resolveOrigin(event),
    pollId: poll.id,
    options: poll.options,
    question,
    note,
    eventTitle: ev.title,
    eventDate: ev.event_date ? formatEmailDate(ev.event_date) : null,
    hostName
  })

  const { sent, failed, error, messages } = await sendAnnounce({
    apiKey: resendApiKey,
    from: personalFrom(resendFrom, hostName),
    replyTo: user.email ?? undefined,
    recipients: mails
  })
  await recordSend(db, { eventId, kind: 'poll', subject: `Poll — ${question}`, sentBy: userId, sent, failed, error, messages })

  return { ok: true, pollId: poll.id, sent, failed, error }
})
