import type { MaybeRefOrGetter } from 'vue'
import type { Database } from '~/types/database.types'

/** One sent communication (announcement or invite blast) for an event. */
export interface CommsLogEntry {
  id: string
  kind: 'announcement' | 'invite'
  scope: string | null
  subject: string | null
  recipientCount: number
  sentByName: string | null
  createdAt: string
}

/**
 * Admin-only log of communications sent for an event — announcements and e-vite
 * blasts, newest first. Admin-gated by RLS (the comms_log policies); a non-admin
 * reads nothing. Live via realtime, so a fresh send appears without a manual refresh.
 */
export function useCommsLog(eventId: MaybeRefOrGetter<string | null | undefined>): {
  entries: Ref<CommsLogEntry[]>
  error: Ref<string | null>
  refresh: () => Promise<void>
} {
  const supabase = useSupabaseClient<Database>()

  const { data: entries, error, refresh } = useRealtimeQuery<CommsLogEntry[]>({
    key: eventId,
    channel: 'comms-log',
    tables: [{ table: 'comms_log' }],
    empty: [],
    errorFallback: 'Failed to load the comms log',
    load: async (id) => {
      const { data, error } = await supabase
        .from('comms_log')
        .select('id, kind, scope, subject, recipient_count, sent_by, created_at')
        .eq('event_id', id)
        .order('created_at', { ascending: false })
      if (error) throw error
      const rows = data ?? []

      const senderIds = [...new Set(rows.map(r => r.sent_by).filter((x): x is string => Boolean(x)))]
      const { data: senders } = senderIds.length
        ? await supabase.from('profiles').select('id, display_name').in('id', senderIds)
        : { data: [] }
      const nameById = new Map((senders ?? []).map(s => [s.id, s.display_name]))

      return rows.map(r => ({
        id: r.id,
        // DB CHECK constrains kind to this set; narrow at the boundary.
        kind: r.kind === 'invite' ? 'invite' : 'announcement',
        scope: r.scope,
        subject: r.subject,
        recipientCount: r.recipient_count,
        sentByName: r.sent_by ? nameById.get(r.sent_by) ?? null : null,
        createdAt: r.created_at
      }))
    }
  })

  return { entries, error, refresh }
}
