import type { MaybeRefOrGetter } from 'vue'
import type { Database } from '~/types/database.types'

/** One announcement recipient with their engagement stamps (webhook-fed). */
export interface CommsRecipient {
  id: string
  email: string
  deliveredAt: string | null
  openedAt: string | null
  clickedAt: string | null
  bouncedAt: string | null
}

export interface CommsEngagementStats {
  sent: number
  delivered: number
  opened: number
  clicked: number
  bounced: number
}

/**
 * Per-recipient engagement for one comms_log entry — who the blast reached and
 * who opened/clicked, live via realtime (the Resend webhook stamps rows as
 * events arrive, so an open modal updates itself). Admin-gated by RLS; empty
 * for sends made before per-recipient recording existed.
 */
export function useCommsRecipients(commsLogId: MaybeRefOrGetter<string | null | undefined>): {
  recipients: Ref<CommsRecipient[]>
  stats: ComputedRef<CommsEngagementStats>
  error: Ref<string | null>
  refresh: () => Promise<void>
} {
  const supabase = useSupabaseClient<Database>()

  const { data: recipients, error, refresh } = useRealtimeQuery<CommsRecipient[]>({
    key: commsLogId,
    channel: 'comms-recipients',
    // global: the default realtime filter is event_id=eq.<key>, but this table
    // is keyed by comms_log_id — webhook stamps are rare, so refetch on any change.
    tables: [{ table: 'comms_recipients', global: true }],
    empty: [],
    errorFallback: 'Failed to load recipients',
    load: async (id) => {
      const { data, error: loadError } = await supabase
        .from('comms_recipients')
        .select('id, email, delivered_at, opened_at, clicked_at, bounced_at')
        .eq('comms_log_id', id)
        .order('email')
      if (loadError) throw loadError
      return (data ?? []).map(r => ({
        id: r.id,
        email: r.email,
        deliveredAt: r.delivered_at,
        openedAt: r.opened_at,
        clickedAt: r.clicked_at,
        bouncedAt: r.bounced_at
      }))
    }
  })

  const stats = computed<CommsEngagementStats>(() => ({
    sent: recipients.value.length,
    delivered: recipients.value.filter(r => r.deliveredAt).length,
    opened: recipients.value.filter(r => r.openedAt).length,
    clicked: recipients.value.filter(r => r.clickedAt).length,
    bounced: recipients.value.filter(r => r.bouncedAt).length
  }))

  return { recipients, stats, error, refresh }
}
