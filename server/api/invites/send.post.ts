import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
import { z } from 'zod'
import type { Database } from '~/types/database.types'

const bodySchema = z.object({
  email: z.string().email().transform(s => s.trim().toLowerCase()),
  name: z.string().trim().max(120).optional()
})

/**
 * Invite a friend: any allowlisted member adds an email to the allowlist and we
 * send them an e-vite. The insert runs under the member's own session so RLS
 * (must be allowlisted + not blocked) and the total-invite cap trigger apply —
 * the route never bypasses the authorization boundary (Invariant 1). The Resend
 * key stays server-only (Invariant 2).
 */
export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })

  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'A valid email is required' })
  }
  const { email, name } = parsed.data

  const client = await serverSupabaseClient<Database>(event)
  const { error: insertError } = await client.from('invites').insert({
    email,
    display_name: name ?? null,
    invited_by: user.id
  })
  // 23505 = already on the allowlist; that's fine, we still (re)send the e-vite.
  if (insertError && insertError.code !== '23505') {
    // RLS denial / cap reached / blocked all surface here.
    throw createError({ statusCode: 403, statusMessage: insertError.message || 'Could not add invite' })
  }

  // Enrich the e-vite with the next upcoming event, if any (read is RLS-gated).
  const { data: nextEvent } = await client
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
