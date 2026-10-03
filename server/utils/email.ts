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

/**
 * The From header for a send made by a person: "Pat Smith via Benteen Screen
 * <movienight@…>". Inboxes show the display name first, and a person's name is
 * what gets a friend's email opened. Only the display name changes — the address
 * stays the verified sender, so SPF/DKIM are unaffected. Falls back to the
 * configured sender when there is no usable name (none, or an email address
 * standing in for one).
 */
export function personalFrom(from: string, senderName: string | null | undefined): string {
  if (!senderName || senderName.includes('@')) return from
  // A display name is a mail header: keep letters, digits and name punctuation
  // only, so nothing in a profile name can break out of (or inject into) it.
  const name = senderName.replace(/[^\p{L}\p{N} .'-]/gu, ' ').replace(/\s+/g, ' ').trim()
  if (!name) return from
  const match = /^\s*(.*?)\s*<([^<>]+)>\s*$/.exec(from)
  const brand = match?.[1]?.replace(/"/g, '') ?? ''
  const address = match?.[2] ?? from.trim()
  return `${brand ? `${name} via ${brand}` : name} <${address}>`
}

/** One email Resend accepted: its message id, who it went to, and the guest-list
 *  row it was about (when there is one). Recorded in `email_messages` so
 *  delivery and opens are tracked per recipient, for every kind of send. */
export interface SentMessage {
  readonly resendId: string
  readonly email: string
  readonly inviteId: string | null
}

/** The current delivery state of one sent email, as Resend reports it. */
export interface EmailStatus {
  readonly id: string
  /** Resend's `last_event`: delivered, opened, clicked, bounced, … */
  readonly lastEvent: string
}

const EMAIL_STATUS_PAGE_SIZE = 100

/**
 * One page of the account's sent emails, newest first, with each one's latest
 * delivery event. Pass the last id of a page as `after` to fetch the next. The
 * pull-based twin of the Resend webhook: it lets the app recover delivery/opens
 * even when no webhook ever arrived.
 */
export async function listEmailStatuses(
  apiKey: string,
  after?: string
): Promise<{ items: EmailStatus[], hasMore: boolean }> {
  const resend = getResend(apiKey)
  const { data, error } = await resend.emails.list(
    after ? { limit: EMAIL_STATUS_PAGE_SIZE, after } : { limit: EMAIL_STATUS_PAGE_SIZE }
  )
  if (error) throw new Error(error.message || 'Failed to list emails')
  return {
    items: (data?.data ?? []).map(email => ({ id: email.id, lastEvent: email.last_event })),
    hasMore: data?.has_more ?? false
  }
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

/** The messages Resend accepted from one batch, paired back to their recipients. */
function acceptedMessages<T>(
  group: readonly T[],
  ids: readonly (string | null)[],
  toRecipient: (item: T) => { email: string, inviteId: string | null }
): SentMessage[] {
  return group.flatMap((item, i) => {
    const resendId = ids[i]
    return resendId ? [{ resendId, ...toRecipient(item) }] : []
  })
}

/** One person's copy of an announcement: their own greeting, their own message id. */
export interface AnnounceMail {
  readonly email: string
  /** Their guest-list row for this event, when they are on it. */
  readonly inviteId: string | null
  readonly subject: string
  readonly html: string
  readonly text: string
}

export interface SendAnnounceResult {
  /** Recipients Resend accepted. */
  readonly sent: number
  /** Recipients in batches that failed. */
  readonly failed: number
  /** First failure message (e.g. an unverified sender domain); null on full success. */
  readonly error: string | null
  /** One entry per accepted email, for the per-recipient delivery log. */
  readonly messages: readonly SentMessage[]
}

/**
 * Sends an announcement as one distinct email per recipient — addressed to them,
 * greeting them by name, with its own Resend message id — through the batch
 * endpoint (100 per request), exactly like the e-vite. This replaces the old
 * BCC-in-groups send, which gave 49 people one shared message id (so nobody's
 * open could be attributed) and arrived addressed to the sender, a pattern
 * mailbox providers read as bulk mail. Continues past a failed batch so a
 * mid-blast error doesn't lose the batches that already went out.
 *
 * ⚠️ At-least-once, like the e-vite blast: a retry after a partial failure
 * re-delivers to the batches that already succeeded. The returned
 * `failed`/`error` are the operator's signal.
 */
export async function sendAnnounce(opts: {
  readonly apiKey: string
  readonly from: string
  readonly replyTo?: string
  readonly recipients: readonly AnnounceMail[]
  readonly batchSize?: number
  readonly interBatchMs?: number
}): Promise<SendAnnounceResult> {
  const batchSize = opts.batchSize ?? INVITE_BATCH_SIZE
  const interBatchMs = opts.interBatchMs ?? INVITE_INTER_BATCH_MS
  const messages: SentMessage[] = []
  let firstError: string | null = null
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
      messages.push(...acceptedMessages(group, ids, r => ({ email: r.email, inviteId: r.inviteId })))
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unknown error'
      if (!firstError) firstError = message
      console.error('[events/announce] batch failed -', message)
    }
  }
  return { sent: messages.length, failed: opts.recipients.length - messages.length, error: firstError, messages }
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
  /** One entry per accepted email, for the per-recipient delivery log. */
  readonly messages: readonly SentMessage[]
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
  const messages: SentMessage[] = []
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
      messages.push(...acceptedMessages(group, ids, r => ({ email: r.email, inviteId: r.id })))
    } catch (e) {
      // Don't swallow: a swallowed Resend rejection once looked like "everyone was
      // already invited". A batch fails as a unit (e.g. an unverified sender
      // domain), so flag the whole group and leave sent_at null for a later retry.
      const message = e instanceof Error ? e.message : 'Unknown error'
      for (const r of group) failures.push({ email: r.email, error: message })
      console.error('[invites/send] batch failed -', message)
    }
  }
  return { sent, failed: failures.length, error: failures[0]?.error ?? null, messages }
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
  /** Greets them by first name when known. */
  readonly display_name?: string | null
}

/**
 * Sends the RSVP reminder to a list of non-responders for one event, in
 * rate-limit-friendly batches, and stamps `reminded_at` on the ones that went
 * out. Each reminder is a distinct one-click token email (like the e-vite), so it
 * uses the batch endpoint, not a BCC. Returns sent/failed counts, the first
 * error, and the accepted messages; the caller records the send.
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
): Promise<{ sent: number, failed: number, error: string | null, messages: readonly SentMessage[] }> {
  const batchSize = opts.batchSize ?? INVITE_BATCH_SIZE
  const interBatchMs = opts.interBatchMs ?? INVITE_INTER_BATCH_MS
  const stamp = new Date().toISOString()
  const messages: SentMessage[] = []
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
          appUrl: opts.appUrl,
          recipientName: inv.display_name
        })
        return { to: inv.email, subject: mail.subject, html: mail.html, text: mail.text, replyTo: opts.replyTo }
      })
      const { ids } = await sendBatch(opts.apiKey, opts.from, items)
      // Stamp only the ones Resend accepted, so a failed batch retries next time.
      const accepted = acceptedMessages(group, ids, inv => ({ email: inv.email, inviteId: inv.id }))
      if (accepted.length) {
        const sentIds = accepted.flatMap(m => m.inviteId ?? [])
        const { error: stampError } = await db.from('event_invites').update({ reminded_at: stamp }).in('id', sentIds)
        if (stampError) console.warn('[reminders] reminded_at stamp failed -', stampError.message)
      }
      messages.push(...accepted)
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unknown error'
      if (!firstError) firstError = message
      console.error('[reminders] batch failed -', message)
    }
  }
  return { sent: messages.length, failed: opts.invites.length - messages.length, error: firstError, messages }
}

/**
 * Blast the club-welcome mail to everyone newly added to the roster in idle mode.
 * Same batching as the e-vite blast (one Resend request per 100, paced under the
 * rate limit), but there's nothing per-recipient to stamp — the roster row already
 * exists, and a repeat paste never reaches here because the caller only passes rows
 * the insert actually created. A failed batch is reported, never swallowed: the
 * people are on the roster either way, and the admin needs to know the welcome
 * didn't go out.
 */
export async function sendClubWelcomes(opts: {
  readonly apiKey: string
  readonly from: string
  readonly recipients: readonly string[]
  readonly mail: { subject: string, html: string, text: string }
  readonly replyTo?: string
  readonly batchSize?: number
  readonly interBatchMs?: number
}): Promise<{ sent: number, failed: number, error: string | null }> {
  const batchSize = opts.batchSize ?? INVITE_BATCH_SIZE
  const interBatchMs = opts.interBatchMs ?? INVITE_INTER_BATCH_MS

  let sent = 0
  const failures: string[] = []
  const batches = chunk(opts.recipients, batchSize)
  for (let b = 0; b < batches.length; b++) {
    if (b > 0) await sleep(interBatchMs)
    const group = batches[b]!
    try {
      await sendBatch(
        opts.apiKey,
        opts.from,
        group.map(email => ({
          to: email,
          subject: opts.mail.subject,
          html: opts.mail.html,
          text: opts.mail.text,
          replyTo: opts.replyTo
        }))
      )
      sent += group.length
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unknown error'
      failures.push(message)
      console.error('[invites/roster] batch failed -', message)
    }
  }
  return { sent, failed: opts.recipients.length - sent, error: failures[0] ?? null }
}
