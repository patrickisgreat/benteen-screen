/** Outcome of a comms send, recorded on `comms_log.status`. */
export type CommsStatus = 'sent' | 'partial' | 'failed'

/**
 * Classify a send from its sent/failed counts: `partial` when some went out and
 * some failed, `failed` when none went out, otherwise `sent`. By convention
 * (0, 0) is `sent` — nothing attempted is not a failure — though callers guard
 * against logging empty sends. Kept pure so the reminder cron + manual route
 * derive the same status without duplicating logic.
 */
export function commsStatus(sent: number, failed: number): CommsStatus {
  if (failed > 0) return sent > 0 ? 'partial' : 'failed'
  return 'sent'
}

/** How one send's emails fared, counted from its per-recipient delivery log. */
export interface DeliveryStats {
  /** Emails tracked for this send (one per recipient Resend accepted). */
  tracked: number
  delivered: number
  opened: number
  clicked: number
  bounced: number
}

/** The engagement stamps of one tracked email, keyed to the send it belongs to. */
export interface TrackedMessage {
  comms_log_id: string | null
  delivered_at: string | null
  opened_at: string | null
  clicked_at: string | null
  bounced_at: string | null
}

/**
 * Count delivered/opened/clicked/bounced per send. Messages with no send to
 * attach to (a backfilled e-vite whose log entry couldn't be matched) are left
 * out — they still show on the guest list.
 */
export function tallyDelivery(messages: readonly TrackedMessage[]): Map<string, DeliveryStats> {
  const bySend = new Map<string, DeliveryStats>()
  for (const message of messages) {
    if (!message.comms_log_id) continue
    const stats = bySend.get(message.comms_log_id) ?? { tracked: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0 }
    stats.tracked += 1
    if (message.delivered_at != null) stats.delivered += 1
    if (message.opened_at != null) stats.opened += 1
    if (message.clicked_at != null) stats.clicked += 1
    if (message.bounced_at != null) stats.bounced += 1
    bySend.set(message.comms_log_id, stats)
  }
  return bySend
}
