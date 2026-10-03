import { serverSupabaseClient } from '#supabase/server'
import type { Database } from '~/types/database.types'

/**
 * Admin event blast: emails a chosen audience about an event, or with
 * `preview: true` just reports who that audience is (count + names) so the
 * composer can show "will email N people" before anything goes out. Runs under
 * the caller's own session (RLS): an admin is allowlisted, so they can read
 * invites/rsvps/profiles/event_invites — no service role needed. Every recipient
 * gets their own copy (addressed to them, greeting them by name), so addresses
 * aren't leaked and each one's delivery/opens are tracked like an e-vite. Resend
 * key is server-only (Invariant 2).
 *
 * Audiences (see shared/utils/announce.ts): this night's guest list, those going,
 * hand-picked people, all members, or the whole club roster.
 */
export default defineEventHandler(async (event) => {
  const { user, userId } = await requireUser(event)

  // RLS-scoped client: runs as the signed-in user via their session cookie.
  const db = await serverSupabaseClient<Database>(event)
  await requireAdmin(db, userId)

  const parsed = parseAnnounceRequest(await readBody(event))
  if (!parsed.ok) throw createError({ statusCode: 400, statusMessage: parsed.error })
  const request = parsed.value

  const { data: ev } = await db.from('events').select('title, event_date').eq('id', request.eventId).single()
  if (!ev) throw createError({ statusCode: 404, statusMessage: 'Event not found' })

  const recipients = await resolveAnnounceAudience(db, request.eventId, request.scope, request.emails)
  if (request.preview) return { ok: true, count: recipients.length, recipients }

  if (!recipients.length) return { ok: true, count: 0, failed: 0, error: null }

  const { resendApiKey, resendFrom } = requireEmailConfig(event)

  // Recipients who are on this night's guest list: their opens count toward
  // their guest row, the same as the e-vite's. Best-effort — without the lookup
  // the announcement is still tracked per message.
  const { data: guests, error: guestsError } = await db.from('event_invites').select('id, email, token').eq('event_id', request.eventId)
  if (guestsError) console.warn('[events/announce] guest lookup failed -', guestsError.message)
  const mails = buildAnnounceMails({
    recipients,
    guests: guests ?? [],
    scope: request.scope,
    origin: resolveOrigin(event),
    eventTitle: ev.title,
    eventDate: ev.event_date ? formatEmailDate(ev.event_date) : null,
    message: request.message,
    subject: request.subject
  })

  // One distinct email per person through the batch endpoint. Continues past a
  // failed batch, so a mid-blast error doesn't lose the ones that already
  // delivered — the result reports sent/failed for the UI (no all-or-nothing 502).
  const { sent, failed, error, messages } = await sendAnnounce({
    apiKey: resendApiKey,
    from: personalFrom(resendFrom, inviterNameFromClaims(user)),
    replyTo: user.email ?? undefined,
    recipients: mails
  })

  if (sent > 0) {
    await recordSend(db, {
      eventId: request.eventId,
      kind: 'announcement',
      scope: request.scope,
      // Every copy shares the subject; only the greeting differs.
      subject: mails[0]!.subject,
      sentBy: userId,
      sent,
      failed,
      error,
      messages
    })
  }

  return { ok: true, count: sent, failed, error }
})
