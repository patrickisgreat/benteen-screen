import { serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'
import { z } from 'zod'
import type { Database } from '~/types/database.types'

const bodySchema = z.object({
  email: z.string().email().transform(s => s.trim().toLowerCase()),
  name: z.string().trim().max(120).optional()
})

/**
 * Invite a friend: an allowlisted, non-blocked member adds an email to the
 * allowlist and we send them an e-vite. Uses the service role (the caller's
 * session isn't reliably available in the serverless fn), so we re-check the
 * inviter is allowed + not blocked here — the same gate RLS would apply
 * (Invariant 1). The Resend key stays server-only (Invariant 2).
 */
export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })

  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'A valid email is required' })
  }
  const { email, name } = parsed.data

  const db = serverSupabaseServiceRole<Database>(event)

  // The inviter must be an allowlisted (admin or on the list), non-blocked member.
  const { data: me } = await db.from('profiles').select('is_admin, blocked').eq('id', user.id).single()
  if (!me || me.blocked) throw createError({ statusCode: 403, statusMessage: 'Not allowed to invite' })
  let allowed = me.is_admin
  const inviterEmail = (user.email ?? '').trim().toLowerCase()
  if (!allowed && inviterEmail) {
    const { data: onList } = await db.from('invites').select('email').eq('email', inviterEmail).maybeSingle()
    allowed = Boolean(onList)
  }
  if (!allowed) throw createError({ statusCode: 403, statusMessage: 'Not allowed to invite' })

  // 23505 = already on the allowlist; that's fine, we still (re)send the e-vite.
  const { error: insertError } = await db.from('invites').insert({
    email,
    display_name: name ?? null,
    invited_by: user.id
  })
  if (insertError && insertError.code !== '23505') {
    throw createError({ statusCode: 400, statusMessage: insertError.message || 'Could not add invite' })
  }

  // Enrich the e-vite with the next upcoming event, if any.
  const { data: nextEvent } = await db
    .from('events')
    .select('title, event_date')
    .gte('event_date', new Date().toISOString())
    .order('event_date', { ascending: true })
    .limit(1)
    .maybeSingle()

  const config = useRuntimeConfig(event)
  if (!config.resendApiKey) {
    // Allowlisting succeeded; email just isn't configured in this environment.
    return { ok: true, emailed: false }
  }

  const meta = user.user_metadata as Record<string, string | undefined> | undefined
  const inviterName = meta?.full_name ?? meta?.name ?? user.email ?? null
  const mail = buildInviteEmail({
    inviterName,
    link: `${config.siteUrl || getRequestURL(event).origin}/login`,
    eventTitle: nextEvent?.title ?? null,
    eventDate: nextEvent?.event_date ? formatEmailDate(nextEvent.event_date) : null
  })

  try {
    await sendEmail(config.resendApiKey, config.resendFrom, {
      to: email,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      replyTo: user.email ?? undefined
    })
  } catch {
    // The person is allowlisted either way — report partial success.
    throw createError({ statusCode: 502, statusMessage: 'Invited, but the email could not be sent' })
  }

  return { ok: true, emailed: true }
})
