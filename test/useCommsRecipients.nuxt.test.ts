// @vitest-environment nuxt
import { describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import type { CommsRecipient } from '../app/composables/useCommsRecipients'

const rows = [
  { id: 'r1', email: 'a@x.com', delivered_at: '2026-07-12T00:01:00Z', opened_at: '2026-07-12T00:02:00Z', clicked_at: '2026-07-12T00:03:00Z', bounced_at: null },
  { id: 'r2', email: 'b@x.com', delivered_at: '2026-07-12T00:01:00Z', opened_at: '2026-07-12T00:02:00Z', clicked_at: null, bounced_at: null },
  { id: 'r3', email: 'c@x.com', delivered_at: '2026-07-12T00:01:00Z', opened_at: null, clicked_at: null, bounced_at: null },
  { id: 'r4', email: 'd@x.com', delivered_at: null, opened_at: null, clicked_at: null, bounced_at: '2026-07-12T00:01:00Z' }
]

const supabase = {
  from() {
    return { select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: rows, error: null }) }) }) }
  },
  channel() {
    const ch = { on: () => ch, subscribe: () => ch }
    return ch
  },
  removeChannel() {}
}

mockNuxtImport('useSupabaseClient', () => () => supabase)

async function settle(recipients: { value: CommsRecipient[] }): Promise<void> {
  await vi.waitFor(() => {
    if (recipients.value.length === 0) throw new Error('not loaded')
  })
  await nextTick()
}

describe('useCommsRecipients', () => {
  it('maps recipient rows with their engagement stamps', async () => {
    const { recipients } = useCommsRecipients(ref('c1'))
    await settle(recipients)
    expect(recipients.value).toHaveLength(4)
    expect(recipients.value[0]).toEqual({
      id: 'r1',
      email: 'a@x.com',
      deliveredAt: '2026-07-12T00:01:00Z',
      openedAt: '2026-07-12T00:02:00Z',
      clickedAt: '2026-07-12T00:03:00Z',
      bouncedAt: null
    })
  })

  it('computes sent / delivered / opened / clicked / bounced counts', async () => {
    const { recipients, stats } = useCommsRecipients(ref('c1'))
    await settle(recipients)
    expect(stats.value).toEqual({ sent: 4, delivered: 3, opened: 2, clicked: 1, bounced: 1 })
  })

  it('holds empty without a log id', () => {
    const { recipients, stats } = useCommsRecipients(ref(null))
    expect(recipients.value).toEqual([])
    expect(stats.value.sent).toBe(0)
  })
})
