// @vitest-environment nuxt
import { describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import type { CommsLogEntry } from '../app/composables/useCommsLog'

interface LogRow { id: string, kind: string, scope: string | null, subject: string | null, recipient_count: number, failed_count?: number, status?: string, error?: string | null, sent_by: string | null, created_at: string }
let logRows: LogRow[] = []
const profiles = [{ id: 'pat', display_name: 'Pat' }]

const supabase = {
  from(table: string) {
    if (table === 'comms_log') {
      return { select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: logRows, error: null }) }) }) }
    }
    // profiles
    return { select: () => ({ in: () => Promise.resolve({ data: profiles, error: null }) }) }
  },
  channel() {
    const ch = { on: () => ch, subscribe: () => ch }
    return ch
  },
  removeChannel() {}
}

mockNuxtImport('useSupabaseClient', () => () => supabase)

async function settle(entries: { value: CommsLogEntry[] }): Promise<void> {
  await vi.waitFor(() => {
    if (logRows.length > 0 && entries.value.length === 0) throw new Error('not loaded')
  })
  await nextTick()
}

describe('useCommsLog', () => {
  it('maps rows newest-first with kind narrowed and sender name resolved', async () => {
    logRows = [
      { id: 'c1', kind: 'announcement', scope: 'going', subject: 'Hi', recipient_count: 5, sent_by: 'pat', created_at: '2026-06-20T00:00:00Z' },
      { id: 'c2', kind: 'invite', scope: null, subject: 'E-vite', recipient_count: 9, sent_by: null, created_at: '2026-06-19T00:00:00Z' }
    ]
    const { entries } = useCommsLog(ref('e1'))
    await settle(entries)
    expect(entries.value).toHaveLength(2)
    expect(entries.value[0]).toMatchObject({ kind: 'announcement', recipientCount: 5, sentByName: 'Pat', scope: 'going' })
    expect(entries.value[1]).toMatchObject({ kind: 'invite', sentByName: null })
  })

  it('coerces an unexpected kind to announcement at the boundary', async () => {
    logRows = [{ id: 'c3', kind: 'weird', scope: null, subject: null, recipient_count: 0, sent_by: null, created_at: '2026-06-20T00:00:00Z' }]
    const { entries } = useCommsLog(ref('e1'))
    await settle(entries)
    expect(entries.value[0]!.kind).toBe('announcement')
  })

  it('surfaces a reminder with its failure status, failed count, and error', async () => {
    logRows = [{
      id: 'c4', kind: 'reminder', scope: null, subject: 'Reminder — Jaws',
      recipient_count: 3, failed_count: 2, status: 'partial', error: 'Unverified domain',
      sent_by: null, created_at: '2026-06-21T00:00:00Z'
    }]
    const { entries } = useCommsLog(ref('e1'))
    await settle(entries)
    expect(entries.value[0]).toMatchObject({
      kind: 'reminder', status: 'partial', recipientCount: 3, failedCount: 2, error: 'Unverified domain'
    })
  })

  it('defaults status to sent and failedCount to 0 for legacy rows without the columns', async () => {
    logRows = [{ id: 'c5', kind: 'announcement', scope: null, subject: 'Legacy', recipient_count: 4, sent_by: null, created_at: '2026-06-22T00:00:00Z' }]
    const { entries } = useCommsLog(ref('e1'))
    await settle(entries)
    expect(entries.value[0]).toMatchObject({ status: 'sent', failedCount: 0, error: null })
  })
})
