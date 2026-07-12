import { serverSupabaseClient } from '#supabase/server'
import { z } from 'zod'
import type { Database } from '~/types/database.types'

const bodySchema = z.object({
  eventId: z.string().uuid(),
  subject: z.string().trim().max(200).optional(),
  // Rich HTML from the composer's editor (markup inflates length — hence 10k);
  // must have actual text, not just empty tags. Sanitized in buildAnnounceEmail.
  message: z.string().max(10000).refine(m => htmlToText(m).length > 0),
  scope: z.enum(['members', 'going', 'invited'])
})

/**
 * Admin event blast: emails members about an event. Runs under the caller's own
 * session (RLS): an admin is allowlisted, so they can read invites/rsvps/profiles
 * — no service role needed (a misconfigured service-role key can't break it).
 * Recipients are BCC'd so addresses aren't leaked. Resend key is server-only
 * (Invariant 2).
 *
 *  - invited: everyone on the allowlist (incl. not-yet-joined)
 *  - members: people who've actually signed in (accepted invites)
 *  - going:   people who RSVP'd "going" to this event
 */
export default defineEventHandler(async (event) => {
  const { user, userId } = await requireUser(event)

  // RLS-scoped client: runs as the signed-in user via their session cookie.
  const admin = await serverSupabaseClient<Database>(event)
  await requireAdmin(admin, userId)

  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid announcement' })
  const { eventId, subject, message, scope } = parsed.data

  const { data: ev } = await admin.from('events').select('title, event_date').eq('id', eventId).single()
  if (!ev) throw createError({ statusCode: 404, statusMessage: 'Event not found' })

  let emails: string[] = []
  if (scope === 'invited') {
    const { data } = await admin.from('invites').select('email')
    emails = uniqueEmails((data ?? []).map(row => row.email))
  } else if (scope === 'members') {
    const { data } = await admin.from('invites').select('email').not('accepted_at', 'is', null)
    emails = uniqueEmails((data ?? []).map(row => row.email))
  } else {
    const { data: going } = await admin
      .from('rsvps').select('user_id').eq('event_id', eventId).eq('status', 'going')
    const ids = (going ?? []).map(row => row.user_id)
    if (ids.length) {
      const { data: profs } = await admin.from('profiles').select('email').in('id', ids)
      emails = uniqueEmails((profs ?? []).map(profile => profile.email))
    }
  }

  if (!emails.length) return { ok: true, count: 0 }

  const { resendApiKey, resendFrom } = requireEmailConfig(event)

  const mail = buildAnnounceEmail({
    eventTitle: ev.title,
    eventDate: ev.event_date ? formatEmailDate(ev.event_date) : null,
    message,
    subject,
    link: `${resolveOrigin(event)}/overview`
  })

  // One email per recipient via the batch endpoint (addresses stay private,
  // each send gets its own Resend id for engagement tracking). Continues past a
  // failed batch, so a mid-blast error doesn't lose the batches that already
  // delivered — the result reports sent/failed for the UI (no all-or-nothing 502).
  const { sent, failed, error, recipients } = await sendAnnounce(
    resendApiKey,
    resendFrom,
    { subject: mail.subject, html: mail.html, text: mail.text, replyTo: user.email ?? undefined },
    emails
  )

  // Record what actually went out — including total failures, so the comms log
  // shows the attempt (best-effort: a logging failure must not fail the request).
  if (sent > 0 || failed > 0) {
    const { data: logRow, error: logError } = await admin
      .from('comms_log')
      .insert({
        event_id: eventId,
        kind: 'announcement',
        scope,
        subject: mail.subject,
        body: message,
        recipient_count: sent,
        failed_count: failed,
        status: commsStatus(sent, failed),
        error,
        sent_by: userId
      })
      .select('id')
      .single()
    if (logError) {
      console.error('[events/announce] comms_log insert failed -', logError.message)
    } else if (recipients.length) {
      // Per-recipient rows correlate webhook engagement (delivered/opened/clicked)
      // back to this blast. The emails already went out — log-and-continue.
      const { error: recipientsError } = await admin.from('comms_recipients').insert(
        recipients.map(r => ({ comms_log_id: logRow.id, email: r.email, resend_id: r.resendId }))
      )
      if (recipientsError) console.error('[events/announce] comms_recipients insert failed -', recipientsError.message)
    }
  }

  return { ok: true, count: sent, failed, error }
})
