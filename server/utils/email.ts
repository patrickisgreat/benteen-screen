import { Resend } from 'resend'
import type { H3Event } from 'h3'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~/types/database.types'
import { type AdminReminderDigestItem, buildAdminReminderDigestEmail, buildEventReminderEmail, uniqueEmails } from '../../shared/utils/email'

// The email *builders* (subject/html/text) live in shared/utils/email.ts so the
// admin UI can render a live preview with the exact same output. This server-only
// module keeps the Resend send wrappers, the config/origin helpers its routes
// share, and the batch orchestration (`sendEventInvites` / `sendEventReminders`).
// The API key must never reach the client; the only value imported is a pure
// builder from shared/utils, so this file still loads outside `#supabase/server`.

// Resend's constructor just stores the key (it opens no connection), but a large
// invite blast would otherwise build a fresh client per 100-recipient batch.
// Memoize by key so the whole process shares one instance — the key is constant
// per deployment, so this never leaks across tenants.
let cachedResend: { key: string, client: Resend } | null = null
function getResend(apiKey: string): Resend {
  if (cachedResend?.key !== apiKey) cachedResend = { key: apiKey, client: new Resend(apiKey) }
  return cachedResend.client
}

/** The origin for links in emails: the configured canonical URL, else the request's. */
export function resolveOrigin(event: H3Event): string {
  const { siteUrl } = useRuntimeConfig(event)
  return siteUrl || getRequestURL(event).origin
}

/**
 * Resolves the Resend config, throwing a 500 when no API key is set. Routes that
 * intentionally soft-degrade on a missing key (e.g. invite-a-friend still
 * allowlists the email) should read the config directly instead.
 */
export function requireEmailConfig(event: H3Event): { resendApiKey: string, resendFrom: string } {
  const { resendApiKey, resendFrom } = useRuntimeConfig(event)
  if (!resendApiKey) throw createError({ statusCode: 500, statusMessage: 'Email is not configured' })
  return { resendApiKey, resendFrom }
}

export interface SendParams {
  to: string | string[]
  bcc?: string[]
  subject: string
  html: string
  text: string
  replyTo?: string
}

/** Thin Resend wrapper — throws on failure so callers map it to an HTTP error.
 *  Returns the Resend message id so callers can correlate webhook events. */
export async function sendEmail(apiKey: string, from: string, params: SendParams): Promise<{ id: string | null }> {
  const resend = getResend(apiKey)
  const { data, error } = await resend.emails.send({
    from,
    to: params.to,
    bcc: params.bcc,
    subject: params.subject,
    html: params.html,
    text: params.text,
    replyTo: params.replyTo
  })
  if (error) throw new Error(error.message || 'Failed to send email')
  return { id: data?.id ?? null }
}

/** Send many distinct emails in a single Resend request (up to 100 per call).
 *  Resend rate-limits the API to a handful of requests per second; batching keeps
 *  a large invite blast to one request per 100 recipients instead of one per guest.
 *  Returns the message ids positionally aligned with `items` (null where Resend
 *  did not return an id), so callers can correlate each send back to its row. */
export async function sendBatch(
  apiKey: string,
  from: string,
  items: readonly SendParams[]
): Promise<{ ids: (string | null)[] }> {
  if (items.length === 0) return { ids: [] }
  const resend = getResend(apiKey)
  const { data, error } = await resend.batch.send(
    items.map(params => ({
      from,
      to: params.to,
      bcc: params.bcc,
      subject: params.subject,
      html: params.html,
      text: params.text,
      replyTo: params.replyTo
    }))
  )
  if (error) throw new Error(error.message || 'Failed to send emails')
  const sent = data?.data ?? []
  return { ids: items.map((_, i) => sent[i]?.id ?? null) }
}

// ── E-vite batch orchestration ───────────────────────────────────────────────
// Resend caps the API at a few requests/second. The batch endpoint sends up to 100
// distinct emails per request, so a blast of N guests costs ceil(N/100) requests
// instead of N — well under the limit for any realistic list. The small gap between
// batches keeps even a >500-guest blast (6+ batches) from tripping the cap.
const INVITE_BATCH_SIZE = 100
const INVITE_INTER_BATCH_MS = 250

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))

/** Split a list into fixed-size groups (last group may be smaller). */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

// Resend caps a single send at 50 recipients across to + cc + bcc. We always set
// one `to` (so real addresses stay BCC-hidden), which uses a slot — so only 49 BCC
// fit per send. (50 BCC + the `to` = 51 → Resend rejects the whole group, which is
// why a blast to >49 only delivered the final leftover group.) Distinct from the
// 100-per-request batch endpoint above — that's a different Resend API.
const ANNOUNCE_RECIPIENT_LIMIT = 49

export interface SendAnnounceResult {
  /** Recipients in groups that sent successfully. */
  readonly sent: number
  /** Recipients in groups that failed. */
  readonly failed: number
  /** First failure message (e.g. an unverified sender domain); null on full success. */
  readonly error: string | null
}

/**
 * Sends one announcement to many recipients, BCC'd in groups of 50 (Resend's
 * per-send recipient cap — a single BCC to more than that is rejected, which is
 * what 502'd the blast). Continues past a failed group so a mid-blast error
 * doesn't lose the groups that already went out, returning sent/failed counts +
 * the first error like `sendEventInvites`.
 *
 * ⚠️ At-least-once, like the e-vite blast: announcements have no per-recipient
 * record, so a retry after a partial failure re-delivers to the groups that
 * already succeeded. The returned `failed`/`error` are the operator's signal.
 */
export async function sendAnnounce(
  apiKey: string,
  from: string,
  params: { subject: string, html: string, text: string, replyTo?: string },
  recipients: readonly string[],
  opts: { groupSize?: number, interBatchMs?: number } = {}
): Promise<SendAnnounceResult> {
  const groupSize = opts.groupSize ?? ANNOUNCE_RECIPIENT_LIMIT
  const interBatchMs = opts.interBatchMs ?? INVITE_INTER_BATCH_MS
  const groups = chunk(recipients, groupSize)
  let sent = 0
  let firstError: string | null = null
  for (let i = 0; i < groups.length; i++) {
    if (i > 0) await sleep(interBatchMs)
    const group = groups[i]!
    try {
      await sendEmail(apiKey, from, {
        to: from, // a `to` is required; real recipients are BCC'd
        bcc: [...group],
        subject: params.subject,
        html: params.html,
        text: params.text,
        replyTo: params.replyTo
      })
      sent += group.length
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unknown error'
      if (!firstError) firstError = message
      console.error('[events/announce] batch failed -', message)
    }
  }
  return { sent, failed: recipients.length - sent, error: firstError }
}

/** One guest's prepared e-vite: the `event_invites` row id + the built email. */
export interface InviteRecipient {
  readonly id: string
  readonly email: string
  readonly token: string
  readonly displayName: string | null
  readonly subject: string
  readonly html: string
  readonly text: string
}

export interface SendEventInvitesOptions {
  readonly apiKey: string
  readonly from: string
  readonly replyTo?: string
  readonly eventId: string
  readonly invitedBy: string
  readonly recipients: readonly InviteRecipient[]
  /** Overridable so tests don't split/wait on production values. */
  readonly batchSize?: number
  readonly interBatchMs?: number
}

export interface SendEventInvitesResult {
  readonly sent: number
  readonly failed: number
  /** First failure message (usually identical across a batch, e.g. an unverified
   *  Resend sender domain) so the UI can show the real reason; null on full success. */
  readonly error: string | null
}

/**
 * Sends a guest list's e-vites in rate-limit-friendly batches, then records each
 * batch: allowlists the recipients (best-effort, so they can sign in too) and stamps
 * `sent_at` + the Resend message id on their `event_invites` rows in a single upsert.
 *
 * ⚠️ Delivery is at-least-once, not exactly-once. A batch is sent as a unit, but if
 * Resend accepts it and the stamp upsert then fails, those emails already went out
 * yet stay `sent_at = null` — so they count as failed and a later re-send delivers
 * them a *second* time. Without a transactional outbox that is the accepted
 * trade-off; the surfaced `error` is the operator's signal that a blanket retry of
 * the "failed" invites may duplicate delivery.
 */
export async function sendEventInvites(
  db: SupabaseClient<Database>,
  opts: SendEventInvitesOptions
): Promise<SendEventInvitesResult> {
  const batchSize = opts.batchSize ?? INVITE_BATCH_SIZE
  const interBatchMs = opts.interBatchMs ?? INVITE_INTER_BATCH_MS

  let sent = 0
  const failures: { email: string, error: string }[] = []
  const batches = chunk(opts.recipients, batchSize)
  for (let b = 0; b < batches.length; b++) {
    if (b > 0) await sleep(interBatchMs)
    const group = batches[b]!
    try {
      const { ids } = await sendBatch(
        opts.apiKey,
        opts.from,
        group.map(r => ({ to: r.email, subject: r.subject, html: r.html, text: r.text, replyTo: opts.replyTo }))
      )
      // Best-effort allowlist: the emails already went out, so a failure here must
      // NOT fail the send (re-sending would duplicate) — log it and still stamp.
      const { error: allowlistError } = await db.from('invites').upsert(
        group.map(r => ({ email: r.email, display_name: r.displayName, invited_by: opts.invitedBy })),
        { onConflict: 'email', ignoreDuplicates: true }
      )
      if (allowlistError) console.warn('[invites/send] allowlist upsert failed -', allowlistError.message)

      // Stamp sent_at + each Resend id in ONE upsert keyed on the PK, so a 100-guest
      // batch is a single DB write rather than 100 serial updates. The NOT NULL
      // columns (event_id/email/token) are included so the never-taken insert path
      // stays valid; the rows already exist, so every row takes the update path.
      const sentAt = new Date().toISOString()
      const { error: stampError } = await db.from('event_invites').upsert(
        group.map((r, i) => ({
          id: r.id,
          event_id: opts.eventId,
          email: r.email,
          token: r.token,
          sent_at: sentAt,
          resend_id: ids[i] ?? null
        })),
        { onConflict: 'id' }
      )
      // Sent, but unrecorded: surface it as a batch failure so the rows stay
      // sent_at=null and the operator sees something went wrong (see the
      // at-least-once note above — a retry of this batch may re-deliver it).
      if (stampError) throw new Error(`sent but could not record delivery: ${stampError.message}`)
      sent += group.length
    } catch (e) {
      // Don't swallow: a swallowed Resend rejection once looked like "everyone was
      // already invited". A batch fails as a unit (e.g. an unverified sender
      // domain), so flag the whole group and leave sent_at null for a later retry.
      const message = e instanceof Error ? e.message : 'Unknown error'
      for (const r of group) failures.push({ email: r.email, error: message })
      console.error('[invites/send] batch failed -', message)
    }
  }
  return { sent, failed: failures.length, error: failures[0]?.error ?? null }
}

/**
 * Emails a run summary to every admin after the daily reminder cron sends nudges,
 * so admins see the automated sends they never trigger by hand. Admins are BCC'd
 * (a required `to` uses the sender address, keeping admin addresses hidden from one
 * another). Returns how many admins were notified; sends nothing when there are no
 * admin emails. The caller runs this best-effort — the reminders already went out,
 * so a digest failure must not fail the cron.
 */
export async function sendAdminReminderDigest(
  db: SupabaseClient<Database>,
  opts: {
    readonly apiKey: string
    readonly from: string
    readonly items: readonly AdminReminderDigestItem[]
    readonly totalReminded: number
    readonly adminUrl: string
  }
): Promise<{ notified: number }> {
  const { data: admins } = await db.from('profiles').select('email').eq('is_admin', true)
  const recipients = uniqueEmails((admins ?? []).map(a => a.email))
  if (!recipients.length) return { notified: 0 }

  const mail = buildAdminReminderDigestEmail({
    items: opts.items,
    totalReminded: opts.totalReminded,
    adminUrl: opts.adminUrl
  })
  await sendEmail(opts.apiKey, opts.from, {
    to: opts.from, // a `to` is required; admins are BCC'd so addresses stay hidden
    bcc: recipients,
    subject: mail.subject,
    html: mail.html,
    text: mail.text
  })
  return { notified: recipients.length }
}

// ── Reminder sends (shared by the daily cron + the manual "remind now" route) ──

/** One non-responder to nudge: the `event_invites` row id + their token link. */
export interface ReminderRecipient {
  readonly id: string
  readonly email: string
  readonly token: string
}

/**
 * Sends the RSVP reminder to a list of non-responders for one event, in
 * rate-limit-friendly batches, and stamps `reminded_at` on the ones that went
 * out. Each reminder is a distinct one-click token email (like the e-vite), so it
 * uses the batch endpoint, not a BCC. Returns sent/failed counts + the first
 * error; the caller records the `comms_log` entry.
 */
export async function sendEventReminders(
  db: SupabaseClient<Database>,
  opts: {
    readonly apiKey: string
    readonly from: string
    readonly replyTo?: string
    readonly eventTitle: string
    readonly eventDate: string | null // already formatted for the email body
    readonly daysLeft: number
    readonly origin: string
    readonly appUrl: string
    readonly invites: readonly ReminderRecipient[]
    readonly batchSize?: number
    readonly interBatchMs?: number
  }
): Promise<{ sent: number, failed: number, error: string | null }> {
  const batchSize = opts.batchSize ?? INVITE_BATCH_SIZE
  const interBatchMs = opts.interBatchMs ?? INVITE_INTER_BATCH_MS
  const stamp = new Date().toISOString()
  let sent = 0
  let firstError: string | null = null
  const batches = chunk(opts.invites, batchSize)
  for (let b = 0; b < batches.length; b++) {
    if (b > 0) await sleep(interBatchMs)
    const group = batches[b]!
    try {
      const items = group.map((inv) => {
        const mail = buildEventReminderEmail({
          eventTitle: opts.eventTitle,
          eventDate: opts.eventDate,
          daysLeft: opts.daysLeft,
          rsvpUrl: `${opts.origin}/rsvp?token=${inv.token}`,
          appUrl: opts.appUrl
        })
        return { to: inv.email, subject: mail.subject, html: mail.html, text: mail.text, replyTo: opts.replyTo }
      })
      const { ids } = await sendBatch(opts.apiKey, opts.from, items)
      // Stamp only the ones Resend accepted, so a failed batch retries next time.
      const sentIds = group.filter((_, i) => ids[i] != null).map(inv => inv.id)
      if (sentIds.length) {
        const { error: stampError } = await db.from('event_invites').update({ reminded_at: stamp }).in('id', sentIds)
        if (stampError) console.warn('[reminders] reminded_at stamp failed -', stampError.message)
      }
      sent += sentIds.length
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unknown error'
      if (!firstError) firstError = message
      console.error('[reminders] batch failed -', message)
    }
  }
  return { sent, failed: opts.invites.length - sent, error: firstError }
}
