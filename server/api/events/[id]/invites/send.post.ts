import { serverSupabaseClient } from '#supabase/server'
import type { Database } from '~/types/database.types'

// Resend caps the API at a few requests/second. Its batch endpoint sends up to 100
// distinct emails per request, so a blast of N guests costs ceil(N/100) requests
// instead of N — well under the limit for any realistic list. The small gap between
// batches keeps even a >500-guest blast (6+ batches) from tripping the cap.
const BATCH_SIZE = 100
const INTER_BATCH_MS = 250

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

/**
 * Sends (or re-sends) the tokenized e-vites for an event's guest list. Admin-only.
 * Runs under the caller's own session (RLS) — every table here has an admin policy
 * (`event_invites: admin all`, `invites: create` as self with the cap trigger
 * exempting admins), so the service role isn't needed and a misconfigured
 * service-role key can't break sending. For each not-yet-sent invitee we email the
 * one-click RSVP links, add them to the allowlist so they can sign in too, and
 * stamp sent_at + the Resend message id.
 */
export default defineEventHandler(async (event) => {
  const { user, userId } = await requireUser(event)

  const eventId = getRouterParam(event, 'id')
  if (!eventId) throw createError({ statusCode: 400, statusMessage: 'Missing event id' })

  // RLS-scoped client: runs as the signed-in user via their session cookie.
  const db = await serverSupabaseClient<Database>(event)
  await requireAdmin(db, userId)

  const { data: ev } = await db
    .from('events')
    .select('title, event_date, start_time, location, location_url, poster_url, description, invite_options')
    .eq('id', eventId)
    .single()
  if (!ev) throw createError({ statusCode: 404, statusMessage: 'Event not found' })
  const inviteOptions = normalizeInviteOptions(ev.invite_options)

  const { data: invites, error: queueError } = await db
    .from('event_invites')
    .select('id, email, display_name, token')
    .eq('event_id', eventId)
    .is('sent_at', null)
  if (queueError) {
    throw createError({ statusCode: 500, statusMessage: 'Could not load the guest list', data: { cause: queueError.message, code: queueError.code } })
  }
  const queue = invites ?? []
  if (!queue.length) return { ok: true, sent: 0, failed: 0, error: null }

  const { resendApiKey, resendFrom } = requireEmailConfig(event)
  const origin = resolveOrigin(event)
  const inviterName = inviterNameFromClaims(user)

  // Build every recipient's email up front, then send in batches. Each guest gets a
  // distinct one-click RSVP link, so the messages differ; the batch endpoint handles
  // that (it is N distinct emails in one request, not one email to N people).
  const mails = queue.map(invite => ({
    invite,
    mail: buildEventInviteEmail({
      eventTitle: ev.title,
      eventDate: ev.event_date ? formatEmailDate(ev.event_date) : null,
      eventTime: ev.start_time,
      location: ev.location,
      locationUrl: ev.location_url,
      posterUrl: ev.poster_url,
      description: ev.description,
      inviterName,
      rsvpUrl: `${origin}/rsvp?token=${invite.token}`,
      appUrl: `${origin}/overview`,
      options: inviteOptions
    })
  }))

  let sent = 0
  const failures: { email: string, error: string }[] = []
  const batches = chunk(mails, BATCH_SIZE)
  for (let b = 0; b < batches.length; b++) {
    if (b > 0) await sleep(INTER_BATCH_MS)
    const group = batches[b]!
    try {
      const { ids } = await sendBatch(
        resendApiKey,
        resendFrom,
        group.map(({ invite, mail }) => ({
          to: invite.email,
          subject: mail.subject,
          html: mail.html,
          text: mail.text,
          replyTo: user.email ?? undefined
        }))
      )
      // The batch succeeded as a unit, so allowlist all of its recipients in one
      // round-trip (idempotent) — they can now sign in too.
      await db.from('invites').upsert(
        group.map(({ invite }) => ({ email: invite.email, display_name: invite.display_name, invited_by: userId })),
        { onConflict: 'email', ignoreDuplicates: true }
      )
      // Stamp sent_at + each Resend id so re-sends skip them and webhooks correlate.
      const sentAt = new Date().toISOString()
      for (let i = 0; i < group.length; i++) {
        await db
          .from('event_invites')
          .update({ sent_at: sentAt, resend_id: ids[i] })
          .eq('id', group[i]!.invite.id)
        sent++
      }
    } catch (e) {
      // Leave sent_at null so a later send retries — but record WHY (don't swallow:
      // a swallowed Resend rejection looked like "everyone already invited"). A batch
      // fails as a unit (e.g. an unverified sender domain), so flag the whole group.
      const message = e instanceof Error ? e.message : 'Unknown error'
      for (const { invite } of group) failures.push({ email: invite.email, error: message })
      console.error('[events/invites/send] batch failed -', message)
    }
  }
  // `error` carries the first failure (usually identical across recipients, e.g. an
  // unverified Resend sender domain) so the UI can show the real reason.
  return { ok: true, sent, failed: failures.length, error: failures[0]?.error ?? null }
})
