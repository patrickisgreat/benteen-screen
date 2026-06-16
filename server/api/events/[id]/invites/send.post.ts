import { serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'
import type { Database } from '~/types/database.types'

/**
 * Sends (or re-sends) the tokenized e-vites for an event's guest list. Admin-only,
 * verified explicitly via is_admin. Uses the service role for the DB work because
 * the caller's session isn't reliably available inside the serverless function
 * (an RLS-scoped client there read no rows and 403'd a real admin). For each
 * not-yet-sent invitee we email the one-click RSVP links, add them to the
 * allowlist so they can sign in too, and stamp sent_at + the Resend message id.
 */
export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })

  const eventId = getRouterParam(event, 'id')
  if (!eventId) throw createError({ statusCode: 400, statusMessage: 'Missing event id' })

  const db = serverSupabaseServiceRole<Database>(event)
  const { data: me, error: meError } = await db.from('profiles').select('is_admin').eq('id', user.id).single()
  // If the service-role read fails outright, NUXT_SUPABASE_SECRET_KEY is wrong
  // (it should be the service-role / sb_secret_ key) — surface that, not "Admins only".
  // Bubble the underlying cause so the actual fault is diagnosable: an "Invalid API
  // key" means a bad/mismatched key; a PGRST116 "0 rows" means the key isn't really
  // service-role (RLS applied) or no profile row exists for this user.
  if (meError || !me) {
    console.error('[invites/send] admin verify failed', { code: meError?.code, message: meError?.message, userId: user.id })
    throw createError({
      statusCode: 500,
      statusMessage: 'Could not verify admin — check NUXT_SUPABASE_SECRET_KEY (must be the service-role key)',
      data: { cause: meError?.message ?? 'no profile row returned', code: meError?.code ?? null }
    })
  }
  if (!me.is_admin) throw createError({ statusCode: 403, statusMessage: 'Admins only' })

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
        { email: invite.email, display_name: invite.display_name, invited_by: user.id },
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
