import type { MaybeRefOrGetter } from 'vue'
import { type CommsStatus, type DeliveryStats, tallyDelivery } from '#shared/utils/comms'
import type { Database } from '~/types/database.types'

export type CommsLogKind = 'announcement' | 'invite' | 'reminder' | 'rsvp_confirmation' | 'poll'

const KINDS: readonly CommsLogKind[] = ['announcement', 'invite', 'reminder', 'rsvp_confirmation', 'poll']
const STATUSES: readonly CommsStatus[] = ['sent', 'partial', 'failed']

/** One sent communication (announcement, invite blast, reminder, or RSVP confirmation) for an event. */
export interface CommsLogEntry {
  id: string
  kind: CommsLogKind
  scope: string | null
  subject: string | null
  /** Recipients the send reached (Resend accepted). */
  recipientCount: number
  /** Recipients Resend rejected (0 on a clean send). */
  failedCount: number
  status: CommsStatus
  /** First failure message when status is partial/failed; null otherwise. */
  error: string | null
  sentByName: string | null
  createdAt: string
  /** Delivered/opened counts from the per-recipient log; null when the send
   *  predates it (nothing tracked). */
  delivery: DeliveryStats | null
}

/** What a delivery-status refresh found: emails checked, and how many changed. */
export interface DeliverySyncResult {
  checked: number
  updated: number
}

/** Narrow a free-text DB value to a known member, falling back to `fallback`. */
function oneOf<T extends string>(values: readonly T[], value: string, fallback: T): T {
  return (values as readonly string[]).includes(value) ? value as T : fallback
}

/**
 * Admin-only log of communications sent for an event — announcements and e-vite
 * blasts, newest first — each with its delivered/opened counts. Admin-gated by RLS
 * (the comms_log + email_messages policies); a non-admin reads nothing. Live via
 * realtime, so a fresh send or a new open appears without a manual refresh.
 * `syncDelivery` asks the server to pull the latest status from Resend, so the
 * counts stay current even when webhook events don't arrive.
 */
export function useCommsLog(eventId: MaybeRefOrGetter<string | null | undefined>): {
  entries: Ref<CommsLogEntry[]>
  error: Ref<string | null>
  refresh: () => Promise<void>
  syncDelivery: () => Promise<DeliverySyncResult>
} {
  const supabase = useSupabaseClient<Database>()

  const { data: entries, error, refresh } = useRealtimeQuery<CommsLogEntry[]>({
    key: eventId,
    channel: 'comms-log',
    tables: [{ table: 'comms_log' }, { table: 'email_messages' }],
    empty: [],
    errorFallback: 'Failed to load the comms log',
    load: async (id) => {
      const { data, error } = await supabase
        .from('comms_log')
        .select('id, kind, scope, subject, recipient_count, failed_count, status, error, sent_by, created_at')
        .eq('event_id', id)
        .order('created_at', { ascending: false })
      if (error) throw error
      const rows = data ?? []

      const senderIds = [...new Set(rows.map(r => r.sent_by).filter((x): x is string => Boolean(x)))]
      const { data: senders } = senderIds.length
        ? await supabase.from('profiles').select('id, display_name').in('id', senderIds)
        : { data: [] }
      const nameById = new Map((senders ?? []).map(s => [s.id, s.display_name]))

      // Delivery counts are an enrichment: if they can't be read, still show the log.
      const { data: messages, error: messagesError } = await supabase
        .from('email_messages')
        .select('comms_log_id, delivered_at, opened_at, clicked_at, bounced_at')
        .eq('event_id', id)
      if (messagesError) console.warn('[useCommsLog] delivery stats unavailable -', messagesError.message)
      const deliveryBySend = tallyDelivery(messages ?? [])

      return rows.map(r => ({
        id: r.id,
        // DB CHECK constrains kind/status to a known set; narrow at the boundary.
        kind: oneOf(KINDS, r.kind, 'announcement'),
        scope: r.scope,
        subject: r.subject,
        recipientCount: r.recipient_count,
        failedCount: r.failed_count ?? 0,
        status: oneOf(STATUSES, r.status ?? 'sent', 'sent'),
        error: r.error ?? null,
        sentByName: r.sent_by ? nameById.get(r.sent_by) ?? null : null,
        createdAt: r.created_at,
        delivery: deliveryBySend.get(r.id) ?? null
      }))
    }
  })

  async function syncDelivery(): Promise<DeliverySyncResult> {
    const id = toValue(eventId)
    if (!id) return { checked: 0, updated: 0 }
    const result = await $fetch<DeliverySyncResult>(`/api/events/${id}/comms/sync`, { method: 'POST' })
    // Realtime normally reloads the log as stamps land; reload here too so the
    // counts are right even if a realtime event is missed.
    if (result.updated > 0) await refresh()
    return result
  }

  return { entries, error, refresh, syncDelivery }
}
