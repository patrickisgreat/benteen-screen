/** Outcome of a comms send, recorded on `comms_log.status`. */
export type CommsStatus = 'sent' | 'partial' | 'failed'

/**
 * Classify a send from its sent/failed counts: `partial` when some went out and
 * some failed, `failed` when none went out, otherwise `sent`. Kept pure so the
 * reminder cron + manual route derive the same status without duplicating logic.
 */
export function commsStatus(sent: number, failed: number): CommsStatus {
  if (failed > 0) return sent > 0 ? 'partial' : 'failed'
  return 'sent'
}
