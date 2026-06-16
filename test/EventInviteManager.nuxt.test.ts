// @vitest-environment nuxt
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, ref } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import EventInviteManager from '../app/components/EventInviteManager.vue'

interface SendResult { sent: number, failed: number, error: string | null }
interface Toast { title?: string, description?: string, color?: string }

const invites = ref([
  { id: 'a', event_id: 'e', email: 'pat@x.com', display_name: 'Pat', token: '1', rsvp: 'going', rsvp_at: null, invited_by: null, resend_id: null, sent_at: 't', delivered_at: null, opened_at: null, clicked_at: null, bounced_at: null, created_at: '' },
  { id: 'b', event_id: 'e', email: 'sam@x.com', display_name: 'Sam', token: '2', rsvp: null, rsvp_at: null, invited_by: null, resend_id: null, sent_at: null, delivered_at: null, opened_at: null, clicked_at: null, bounced_at: null, created_at: '' }
])
const sendFn = vi.fn<() => Promise<SendResult>>(async () => ({ sent: 0, failed: 0, error: null }))
const removeMany = vi.fn(async () => {})
const seedFn = vi.fn(async () => 0)
const toasts: Toast[] = []

mockNuxtImport('useEventInvites', () => () => ({
  invites,
  pending: ref(false),
  stats: computed(() => ({ invited: 2, sent: 1, opened: 0, clicked: 0, going: 1, maybe: 0, no: 0, noReply: 1 })),
  refresh: async () => {},
  addInvite: async () => {},
  removeInvite: async () => {},
  removeInvites: removeMany,
  seedFromLastEvent: seedFn,
  sendInvites: sendFn
}))
mockNuxtImport('useToast', () => () => ({ add: (t: Toast) => toasts.push(t) }))

const clickSend = async (w: { findAll: (s: string) => Array<{ text: () => string, trigger: (e: string) => Promise<void> }> }): Promise<void> => {
  const send = w.findAll('button').find(b => b.text().includes('Send'))
  await send!.trigger('click')
  await flushPromises()
}

beforeEach(() => {
  toasts.length = 0
  sendFn.mockReset()
  sendFn.mockResolvedValue({ sent: 0, failed: 0, error: null })
})

describe('EventInviteManager', () => {
  it('shows the tracker stats and the guest list', async () => {
    const w = await mountSuspended(EventInviteManager, { props: { eventId: 'e' } })
    expect(w.text()).toContain('invited')
    expect(w.text()).toContain('going')
    expect(w.text()).toContain('Pat')
    expect(w.text()).toContain('Going')
  })

  it('selects all guests and bulk-deletes them', async () => {
    const w = await mountSuspended(EventInviteManager, { props: { eventId: 'e' } })
    await w.get('[aria-label="Select all guests"]').trigger('click')
    // The delete button surfaces with the selected count.
    const del = w.findAll('button').find(b => b.text().includes('Delete'))
    expect(del).toBeTruthy()
    await del!.trigger('click')
    expect(removeMany).toHaveBeenCalledWith(['a', 'b'])
  })

  it('selects a single guest by their row checkbox', async () => {
    removeMany.mockClear()
    const w = await mountSuspended(EventInviteManager, { props: { eventId: 'e' } })
    await w.get('[aria-label="Select Sam"]').trigger('click')
    const del = w.findAll('button').find(b => b.text().includes('Delete'))
    await del!.trigger('click')
    expect(removeMany).toHaveBeenCalledWith(['b'])
  })

  it('does not auto-pull from the last event on load, even when the list is empty', async () => {
    seedFn.mockClear()
    const saved = invites.value
    invites.value = []
    try {
      await mountSuspended(EventInviteManager, { props: { eventId: 'fresh-event' } })
      await flushPromises()
      expect(seedFn).not.toHaveBeenCalled()
    } finally {
      invites.value = saved
    }
  })

  it('pulls from the last event only when the button is clicked', async () => {
    seedFn.mockClear()
    const w = await mountSuspended(EventInviteManager, { props: { eventId: 'e' } })
    const pull = w.findAll('button').find(b => b.text().includes('Pull from last event'))
    await pull!.trigger('click')
    expect(seedFn).toHaveBeenCalledTimes(1)
  })

  it('surfaces the failure reason when a send is rejected (not a fake success)', async () => {
    sendFn.mockResolvedValue({ sent: 0, failed: 1, error: 'The benteenscreenonthegreen.com domain is not verified' })
    const w = await mountSuspended(EventInviteManager, { props: { eventId: 'e' } })
    await clickSend(w)
    const toast = toasts.at(-1)
    expect(toast?.color).toBe('error')
    expect(toast?.title).toContain('Couldn\'t send')
    expect(toast?.description).toBe('The benteenscreenonthegreen.com domain is not verified')
  })

  it('reports a fully successful send', async () => {
    sendFn.mockResolvedValue({ sent: 2, failed: 0, error: null })
    const w = await mountSuspended(EventInviteManager, { props: { eventId: 'e' } })
    await clickSend(w)
    const toast = toasts.at(-1)
    expect(toast?.color).toBe('success')
    expect(toast?.title).toBe('Sent 2 invites')
  })

  it('reports a partial send (some sent, some failed)', async () => {
    sendFn.mockResolvedValue({ sent: 1, failed: 1, error: 'rejected' })
    const w = await mountSuspended(EventInviteManager, { props: { eventId: 'e' } })
    await clickSend(w)
    const toast = toasts.at(-1)
    expect(toast?.color).toBe('warning')
    expect(toast?.title).toBe('Sent 1, 1 failed')
  })

  it('only says "everyone already invited" when nothing was queued', async () => {
    sendFn.mockResolvedValue({ sent: 0, failed: 0, error: null })
    const w = await mountSuspended(EventInviteManager, { props: { eventId: 'e' } })
    await clickSend(w)
    expect(toasts.at(-1)?.title).toBe('Everyone has already been invited')
  })
})
