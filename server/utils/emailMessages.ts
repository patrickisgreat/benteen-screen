import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~/types/database.types'
import { commsStatus } from '../../shared/utils/comms'
import { listEmailStatuses, type SentMessage } from './email'
import type { EmailStampColumn } from './webhook'

// The per-recipient delivery log (`email_messages`): recording what was sent, and
// the two ways its engagement gets filled in — pushed by the Resend webhook
// (`stampEmailEvent`) and pulled from Resend's API (`syncEmailStatuses`). Either
// one alone is enough, so a missed or misconfigured webhook no longer means
// "Resend shows opens, the app shows none".

type Db = SupabaseClient<Database>

export type EmailKind = 'announcement' | 'invite' | 'reminder' | 'rsvp_confirmation' | 'poll' | 'date_change'

export interface SendRecord {
  readonly eventId: string
  readonly kind: EmailKind
  readonly subject: string
  /** Announcement audience; null for the other kinds. */
  readonly scope?: string | null
  /** The admin who sent it; omitted for automated (cron) sends. */
  readonly sentBy?: string | null
  readonly sent: number
  readonly failed: number
  readonly error: string | null
  readonly messages: readonly SentMessage[]
}

/**
 * Records one send: its `comms_log` entry (what went out, with its outcome) plus
 * an `email_messages` row per accepted email, linked to that entry. Best-effort —
 * the emails already went out, so a logging failure is reported in the function
 * logs and must never fail the request (a retry would re-deliver).
 */
export async function recordSend(db: Db, send: SendRecord): Promise<void> {
  const { data: log, error: logError } = await db
    .from('comms_log')
    .insert({
      event_id: send.eventId,
      kind: send.kind,
      scope: send.scope ?? null,
      subject: send.subject,
      recipient_count: send.sent,
      failed_count: send.failed,
      status: commsStatus(send.sent, send.failed),
      error: send.error,
      sent_by: send.sentBy ?? null
    })
    .select('id')
    .single()
  if (logError) console.error(`[comms/${send.kind}] comms_log insert failed -`, logError.message)

  if (!send.messages.length) return
  const { error: messagesError } = await db.from('email_messages').upsert(
    send.messages.map(m => ({
      resend_id: m.resendId,
      event_id: send.eventId,
      comms_log_id: log?.id ?? null,
      invite_id: m.inviteId,
      kind: send.kind,
      email: m.email
    })),
    { onConflict: 'resend_id', ignoreDuplicates: true }
  )
  if (messagesError) console.error(`[comms/${send.kind}] email_messages insert failed -`, messagesError.message)
}

/** Where a webhook event landed: its message row, a legacy e-vite row, or nowhere. */
export type StampTarget = 'message' | 'invite' | 'unmatched'

/**
 * Stamps one webhook event (delivered/opened/clicked/bounced) on the email it
 * belongs to, by Resend message id. The message row is the normal target (a
 * trigger mirrors it onto the guest row). An e-vite whose message row is missing
 * — the table isn't migrated yet, or recording that send failed — still carries
 * its id on `event_invites`, so fall back to stamping the guest row directly.
 */
export async function stampEmailEvent(
  db: Db,
  column: EmailStampColumn,
  resendId: string,
  at: Date = new Date()
): Promise<StampTarget> {
  const patch: Partial<Record<EmailStampColumn, string>> = {}
  patch[column] = at.toISOString()

  const message = await db.from('email_messages').update(patch, { count: 'exact' }).eq('resend_id', resendId)
  if (message.error) console.error(`[email-status] failed to stamp ${column} on message ${resendId} -`, message.error.message)
  if (message.count) return 'message'

  const invite = await db.from('event_invites').update(patch, { count: 'exact' }).eq('resend_id', resendId)
  if (invite.error) throw new Error(invite.error.message)
  return invite.count ? 'invite' : 'unmatched'
}

// What Resend's `last_event` tells us happened. It reports only the latest
// event, and later ones imply the earlier: an opened email was delivered, a
// clicked one was opened. A complaint can only come from a delivered email.
const IMPLIED_STAMPS: Record<string, readonly EmailStampColumn[]> = {
  delivered: ['delivered_at'],
  complained: ['delivered_at'],
  opened: ['delivered_at', 'opened_at'],
  clicked: ['delivered_at', 'opened_at', 'clicked_at'],
  bounced: ['bounced_at']
}

/** The engagement columns a Resend `last_event` proves; none for queued/sent/etc. */
export function impliedStamps(lastEvent: string): readonly EmailStampColumn[] {
  return IMPLIED_STAMPS[lastEvent] ?? []
}

// Only recent sends can still change, and Resend only retains so much history.
const SYNC_WINDOW_DAYS = 30
// 100 emails per page → the 1,000 most recent sends, far more than a club's month.
const SYNC_MAX_PAGES = 10
// Stay under Resend's requests-per-second cap while paging.
const SYNC_PAGE_GAP_MS = 600

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))

export interface SyncResult {
  /** Recent messages whose status could still change. */
  readonly checked: number
  /** Messages that gained at least one new stamp. */
  readonly updated: number
}

/**
 * Pulls delivery status from Resend for recent messages and fills in any stamp
 * the webhook didn't deliver. Looks at messages from the last 30 days that
 * haven't reached a final state (clicked or bounced), pages Resend's sent-email
 * list for their latest event, and stamps only the columns still empty — so it
 * never overwrites a timestamp the webhook recorded, and running it twice is a
 * no-op. Scoped to one event when `eventId` is given.
 */
export async function syncEmailStatuses(
  db: Db,
  apiKey: string,
  opts: { eventId?: string, now?: Date, maxPages?: number, pageGapMs?: number } = {}
): Promise<SyncResult> {
  const now = opts.now ?? new Date()
  const since = new Date(now.getTime() - SYNC_WINDOW_DAYS * 86_400_000).toISOString()

  let query = db
    .from('email_messages')
    .select('id, resend_id, delivered_at, opened_at, clicked_at, bounced_at')
    .gte('sent_at', since)
    .is('clicked_at', null)
    .is('bounced_at', null)
  if (opts.eventId) query = query.eq('event_id', opts.eventId)
  const { data, error } = await query
  if (error) throw new Error(`Could not load sent emails: ${error.message}`)

  const pending = new Map((data ?? []).map(m => [m.resend_id, m]))
  if (!pending.size) return { checked: 0, updated: 0 }

  const lastEventById = new Map<string, string>()
  const maxPages = opts.maxPages ?? SYNC_MAX_PAGES
  let after: string | undefined
  for (let page = 0; page < maxPages; page++) {
    if (page > 0) await sleep(opts.pageGapMs ?? SYNC_PAGE_GAP_MS)
    const { items, hasMore } = await listEmailStatuses(apiKey, after)
    for (const item of items) {
      if (pending.has(item.id)) lastEventById.set(item.id, item.lastEvent)
    }
    after = items.at(-1)?.id
    if (!hasMore || !after || lastEventById.size === pending.size) break
  }

  // Group messages that need the same columns so each group is one UPDATE.
  const groups = new Map<string, { columns: EmailStampColumn[], ids: string[] }>()
  for (const [resendId, lastEvent] of lastEventById) {
    const message = pending.get(resendId)
    if (!message) continue
    const columns = impliedStamps(lastEvent).filter(column => message[column] == null)
    if (!columns.length) continue
    const key = columns.join(',')
    const group = groups.get(key) ?? { columns, ids: [] }
    group.ids.push(message.id)
    groups.set(key, group)
  }

  const stamp = now.toISOString()
  let updated = 0
  for (const { columns, ids } of groups.values()) {
    const patch: Partial<Record<EmailStampColumn, string>> = {}
    for (const column of columns) patch[column] = stamp
    const { error: updateError } = await db.from('email_messages').update(patch).in('id', ids)
    if (updateError) throw new Error(`Could not record delivery status: ${updateError.message}`)
    updated += ids.length
  }
  return { checked: pending.size, updated }
}
