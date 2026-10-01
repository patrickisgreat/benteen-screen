import { serverSupabaseClient } from '#supabase/server'
import type { Database } from '~/types/database.types'

/**
 * Admin event blast: emails a chosen audience about an event, or with
 * `preview: true` just reports who that audience is (count + names) so the
 * composer can show "will email N people" before anything goes out. Runs under
 * the caller's own session (RLS): an admin is allowlisted, so they can read
 * invites/rsvps/profiles/event_invites — no service role needed. Recipients are
 * BCC'd so addresses aren't leaked. Resend key is server-only (Invariant 2).
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

  const emails = recipients.map(r => r.email)
  if (!emails.length) return { ok: true, count: 0, failed: 0, error: null }

  const { resendApiKey, resendFrom } = requireEmailConfig(event)

  const mail = buildAnnounceEmail({
    eventTitle: ev.title,
    eventDate: ev.event_date ? formatEmailDate(ev.event_date) : null,
    message: request.message,
    subject: request.subject,
    link: `${resolveOrigin(event)}/overview`
  })

  // Send in BCC groups of 50 (Resend's per-send cap). Continues past a failed
  // group, so a mid-blast error doesn't lose the groups that already delivered —
  // the result reports sent/failed for the UI to surface (no all-or-nothing 502).
  const { sent, failed, error } = await sendAnnounce(
    resendApiKey,
    resendFrom,
    { subject: mail.subject, html: mail.html, text: mail.text, replyTo: user.email ?? undefined },
    emails
  )

  // Record what actually went out (best-effort — a logging failure must not fail
  // the request; surface it in logs instead).
  if (sent > 0) {
    const { error: logError } = await db.from('comms_log').insert({
      event_id: request.eventId,
      kind: 'announcement',
      scope: request.scope,
      subject: mail.subject,
      recipient_count: sent,
      sent_by: userId
    })
    if (logError) console.error('[events/announce] comms_log insert failed -', logError.message)
  }

  return { ok: true, count: sent, failed, error }
})
