import { serverSupabaseClient } from '#supabase/server'
import { z } from 'zod'
import type { Database } from '~/types/database.types'
import { buildClubWelcomeEmail } from '#shared/utils/email'
import { parseRoster } from '#shared/utils/roster'

const bodySchema = z.object({
  /** The raw paste from the composer; parsed server-side with the same rules. */
  text: z.string().max(20_000)
})

// Resend's batch endpoint takes up to 100 distinct emails per request; the same
// batching the e-vite blast uses keeps a large roster seed to one request per 100.
const BATCH_SIZE = 100

/**
 * Admin-only bulk add to the club allowlist (`public.invites`) for idle mode —
 * when no movie night is scheduled, there is no event to e-vite anyone to, so
 * new people get a "you're in the club, we'll tell you when the next one lands"
 * welcome instead.
 *
 * Runs under the caller's own session (RLS): the `invites: create` policy enforces
 * invited_by = self + allowed + not-blocked, and `enforce_invite_cap` exempts
 * admins from max_invites. We re-check is_admin here for a clean 403. Only rows we
 * actually inserted are emailed, so re-pasting a list never re-spams the roster.
 * The Resend key stays server-only (Invariant 2).
 */
export default defineEventHandler(async (event) => {
  const { user, userId } = await requireUser(event)

  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'A list of emails is required' })

  const db = await serverSupabaseClient<Database>(event)
  await requireAdmin(db, userId)

  const { entries, invalid } = parseRoster(parsed.data.text)
  if (!entries.length) {
    throw createError({ statusCode: 400, statusMessage: 'No valid email addresses in that list' })
  }

  // ON CONFLICT DO NOTHING + RETURNING: `added` is exactly the people who were not
  // already on the roster, which is precisely who should get a welcome email.
  const { data: added, error } = await db
    .from('invites')
    .upsert(
      entries.map(e => ({ email: e.email, display_name: e.name, invited_by: userId })),
      { onConflict: 'email', ignoreDuplicates: true }
    )
    .select('email, display_name')
  if (error) {
    throw createError({ statusCode: 400, statusMessage: error.message || 'Could not add to the roster' })
  }

  const recipients = added ?? []
  const skipped = entries.length - recipients.length
  const base = { ok: true, added: recipients.length, skipped, invalid: [...invalid] }

  const config = useRuntimeConfig(event)
  // Allowlisting succeeded; email just isn't configured in this environment.
  if (!config.resendApiKey || !recipients.length) {
    return { ...base, emailed: 0, failed: 0, error: null }
  }

  const mail = buildClubWelcomeEmail({
    inviterName: inviterNameFromClaims(user),
    link: `${resolveOrigin(event)}/login`
  })

  let emailed = 0
  const failures: string[] = []
  for (const group of chunk(recipients, BATCH_SIZE)) {
    try {
      await sendBatch(
        config.resendApiKey,
        config.resendFrom,
        group.map(r => ({ to: r.email, subject: mail.subject, html: mail.html, text: mail.text, replyTo: user.email ?? undefined }))
      )
      emailed += group.length
    } catch (e) {
      // Don't swallow it: they're on the roster either way, but the admin needs to
      // know the welcome never went out (a silent failure once read as success).
      const message = e instanceof Error ? e.message : 'Unknown error'
      failures.push(message)
      console.error('[invites/roster] batch failed -', message)
    }
  }

  return { ...base, emailed, failed: recipients.length - emailed, error: failures[0] ?? null }
})
