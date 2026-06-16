import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
import { z } from 'zod'
import type { Database } from '~/types/database.types'

const bodySchema = z.object({
  eventId: z.string().uuid(),
  subject: z.string().trim().max(200).optional(),
  message: z.string().trim().min(1).max(5000),
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
  const user = await serverSupabaseUser(event)
  const userId = claimsUserId(user)
  if (!user || !userId) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })

  // RLS-scoped client: runs as the signed-in user via their session cookie.
  const admin = await serverSupabaseClient<Database>(event)
  const { data: me } = await admin.from('profiles').select('is_admin').eq('id', userId).single()
  if (!me?.is_admin) throw createError({ statusCode: 403, statusMessage: 'Admins only' })

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

  const config = useRuntimeConfig(event)
  if (!config.resendApiKey) throw createError({ statusCode: 500, statusMessage: 'Email is not configured' })

  const mail = buildAnnounceEmail({
    eventTitle: ev.title,
    eventDate: ev.event_date ? formatEmailDate(ev.event_date) : null,
    message,
    subject,
    link: `${config.siteUrl || getRequestURL(event).origin}/overview`
  })

  try {
    await sendEmail(config.resendApiKey, config.resendFrom, {
      to: config.resendFrom, // a `to` is required; real recipients are BCC'd
      bcc: emails,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      replyTo: user.email ?? undefined
    })
  } catch (error) {
    throw createError({ statusCode: 502, statusMessage: error instanceof Error ? error.message : 'Send failed' })
  }

  return { ok: true, count: emails.length }
})
