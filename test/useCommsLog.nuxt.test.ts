// @vitest-environment nuxt
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import type { CommsLogEntry } from '../app/composables/useCommsLog'
import type { TrackedMessage } from '../shared/utils/comms'
import { fakeApi } from './utils/fakeApi'

interface LogRow { id: string, kind: string, scope: string | null, subject: string | null, recipient_count: number, failed_count?: number, status?: string, error?: string | null, sent_by: string | null, created_at: string }
let logRows: LogRow[] = []
let messageRows: TrackedMessage[] = []
let messagesError: { message: string } | null = null
let loads = 0

let syncResult = { ok: true, checked: 4, updated: 2 }
const api = fakeApi(['/api/events/e1/comms/sync'], () => syncResult)
const profiles = [{ id: 'pat', display_name: 'Pat' }]

const supabase = {
  from(table: string) {
    if (table === 'comms_log') {
      loads += 1
      return { select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: logRows, error: null }) }) }) }
    }
    if (table === 'email_messages') {
      return { select: () => ({ eq: () => Promise.resolve(messagesError ? { data: null, error: messagesError } : { data: messageRows, error: null }) }) }
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

describe('useCommsLog delivery tracking', () => {
  const sendRow: LogRow = { id: 'c9', kind: 'announcement', scope: 'guests', subject: 'Doors at 7', recipient_count: 3, sent_by: null, created_at: '2026-06-23T00:00:00Z' }
  const tracked = (over: Partial<TrackedMessage>): TrackedMessage => ({
    comms_log_id: 'c9', delivered_at: null, opened_at: null, clicked_at: null, bounced_at: null, ...over
  })

  beforeEach(() => {
    logRows = [sendRow]
    messageRows = []
    messagesError = null
    syncResult = { ok: true, checked: 4, updated: 2 }
    api.reset()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  it('attaches delivered/opened counts from the per-recipient log to each send', async () => {
    messageRows = [tracked({ delivered_at: 't', opened_at: 't' }), tracked({ delivered_at: 't' }), tracked({ bounced_at: 't' })]
    const { entries } = useCommsLog(ref('e1'))
    await settle(entries)
    expect(entries.value[0]!.delivery).toEqual({ tracked: 3, delivered: 2, opened: 1, clicked: 0, bounced: 1 })
  })

  it('leaves delivery null for a send with nothing tracked (it predates the log)', async () => {
    const { entries } = useCommsLog(ref('e1'))
    await settle(entries)
    expect(entries.value[0]!.delivery).toBeNull()
  })

  it('still lists the sends when the delivery log cannot be read', async () => {
    messagesError = { message: 'relation "email_messages" does not exist' }
    const { entries, error } = useCommsLog(ref('e1'))
    await settle(entries)
    expect(entries.value).toHaveLength(1)
    expect(entries.value[0]!.delivery).toBeNull()
    expect(error.value).toBeNull()
  })

  it('syncDelivery asks the server to pull status from Resend and reloads the log when something changed', async () => {
    const { entries, syncDelivery } = useCommsLog(ref('e1'))
    await settle(entries)
    const loadsBefore = loads

    expect(await syncDelivery()).toMatchObject({ checked: 4, updated: 2 })

    expect(api.calls).toHaveLength(1)
    expect(api.calls[0]).toMatchObject({ url: '/api/events/e1/comms/sync', method: 'POST' })
    expect(loads).toBeGreaterThan(loadsBefore)
  })

  it('syncDelivery leaves the log alone when nothing changed', async () => {
    syncResult = { ok: true, checked: 4, updated: 0 }
    const { entries, syncDelivery } = useCommsLog(ref('e1'))
    await settle(entries)
    const loadsBefore = loads

    await syncDelivery()

    expect(loads).toBe(loadsBefore)
  })

  it('syncDelivery does nothing without a selected event', async () => {
    const { syncDelivery } = useCommsLog(ref(null))
    expect(await syncDelivery()).toEqual({ checked: 0, updated: 0 })
    expect(api.calls).toHaveLength(0)
  })
})
