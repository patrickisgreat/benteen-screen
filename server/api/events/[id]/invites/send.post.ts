import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
import type { Database } from '~/types/database.types'

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
  const user = await serverSupabaseUser(event)
  const userId = claimsUserId(user)
  if (!user || !userId) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })

  const eventId = getRouterParam(event, 'id')
  if (!eventId) throw createError({ statusCode: 400, statusMessage: 'Missing event id' })

  // RLS-scoped client: runs as the signed-in user via their session cookie.
  const db = await serverSupabaseClient<Database>(event)
  const { data: me, error: meError } = await db.from('profiles').select('is_admin').eq('id', userId).single()
  if (meError) {
    throw createError({ statusCode: 500, statusMessage: 'Could not load your profile', data: { cause: meError.message, code: meError.code } })
  }
  if (!me?.is_admin) throw createError({ statusCode: 403, statusMessage: 'Admins only' })

  const { data: ev } = await db.from('events').select('title, event_date, location').eq('id', eventId).single()
  if (!ev) throw createError({ statusCode: 404, statusMessage: 'Event not found' })

  const { data: invites } = await db
    .from('event_invites')
    .select('id, email, display_name, token')
    .eq('event_id', eventId)
    .is('sent_at', null)
  const queue = invites ?? []
  if (!queue.length) return { ok: true, sent: 0 }

  const config = useRuntimeConfig(event)
  if (!config.resendApiKey) throw createError({ statusCode: 500, statusMessage: 'Email is not configured' })
  const origin = config.siteUrl || getRequestURL(event).origin
  const meta = user.user_metadata as Record<string, string | undefined> | undefined
  const inviterName = meta?.full_name ?? meta?.name ?? user.email ?? null

  let sent = 0
  for (const invite of queue) {
    const mail = buildEventInviteEmail({
      eventTitle: ev.title,
      eventDate: ev.event_date ? formatEmailDate(ev.event_date) : null,
      location: ev.location,
      inviterName,
      rsvpUrl: `${origin}/rsvp?token=${invite.token}`
    })
    try {
      const { id: resendId } = await sendEmail(config.resendApiKey, config.resendFrom, {
        to: invite.email,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
        replyTo: user.email ?? undefined
      })
      // Allowlist them so they can sign in too (idempotent).
      await db.from('invites').upsert(
        { email: invite.email, display_name: invite.display_name, invited_by: userId },
        { onConflict: 'email', ignoreDuplicates: true }
      )
      await db
        .from('event_invites')
        .update({ sent_at: new Date().toISOString(), resend_id: resendId })
        .eq('id', invite.id)
      sent++
    } catch {
      // Skip this recipient; leave sent_at null so a later send retries it.
    }
  }
  return { ok: true, sent }
})
