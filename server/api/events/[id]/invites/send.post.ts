import { serverSupabaseClient } from '#supabase/server'
import type { Database } from '~/types/database.types'

/**
 * Sends (or re-sends) the tokenized e-vites for an event's guest list. Admin-only.
 * Runs under the caller's own session (RLS) — every table here has an admin policy
 * (`event_invites: admin all`, `invites: create` as self with the cap trigger
 * exempting admins), so the service role isn't needed and a misconfigured
 * service-role key can't break sending. This route owns auth + loading the event
 * and building each guest's one-click RSVP email; it then delegates the
 * rate-limit-friendly batch send + delivery recording to `sendEventInvites`.
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

  // Build every guest's distinct one-click RSVP email up front. Each link differs,
  // so these are N distinct emails (not one email to N people) — exactly what the
  // batch sender fans out across Resend's batch endpoint.
  const recipients = queue.map((invite) => {
    const mail = buildEventInviteEmail({
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
    return {
      id: invite.id,
      email: invite.email,
      token: invite.token,
      displayName: invite.display_name,
      subject: mail.subject,
      html: mail.html,
      text: mail.text
    }
  })

  return {
    ok: true,
    ...(await sendEventInvites(db, {
      apiKey: resendApiKey,
      from: resendFrom,
      replyTo: user.email ?? undefined,
      eventId,
      invitedBy: userId,
      recipients
    }))
  }
})
