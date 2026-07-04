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
const remindFn = vi.fn<() => Promise<SendResult>>(async () => ({ sent: 0, failed: 0, error: null }))
const removeMany = vi.fn(async () => {})
const seedFn = vi.fn(async () => 0)
const saveOptionsFn = vi.fn(async () => {})
const toasts: Toast[] = []

const eventObj = {
  id: 'e',
  title: 'The Goonies',
  description: '<p>Bring snacks</p>',
  event_date: '2026-07-01T00:00:00Z',
  start_time: '8pm',
  location: 'The Green',
  location_url: null,
  poster_url: 'https://img/goonies.jpg',
  voting_locked_at: null,
  invite_options: null,
  created_at: ''
}

mockNuxtImport('useEventInvites', () => () => ({
  invites,
  pending: ref(false),
  stats: computed(() => ({ invited: 2, sent: 1, opened: 0, clicked: 0, going: 1, maybe: 0, no: 0, noReply: 1 })),
  refresh: async () => {},
  addInvite: async () => {},
  removeInvite: async () => {},
  removeInvites: removeMany,
  seedFromLastEvent: seedFn,
  sendInvites: sendFn,
  remindNonResponders: remindFn
}))
mockNuxtImport('useToast', () => () => ({ add: (t: Toast) => toasts.push(t) }))
mockNuxtImport('useInviteOptions', () => () => ({ save: saveOptionsFn }))
mockNuxtImport('useEventReminders', () => () => ({ setEnabled: async () => {} }))
mockNuxtImport('useEventRsvps', () => () => ({
  roster: ref({
    going: [{ key: 'u1', name: 'Ada', email: 'ada@x.com', avatar: null, status: 'going', plusOnes: 0, viaEmail: false }],
    maybe: [],
    no: [],
    noReply: [{ key: 'b@x.com', name: 'Bo', email: 'b@x.com' }],
    total: 1,
    headcount: 1
  }),
  error: ref(null),
  refresh: async () => {}
}))

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

  it('shows the e-vite editor only when an event is provided', async () => {
    const without = await mountSuspended(EventInviteManager, { props: { eventId: 'e' } })
    expect(without.findAll('button').some(b => b.text().includes('Customize the e-vite'))).toBe(false)
    const withEvent = await mountSuspended(EventInviteManager, { props: { eventId: 'e', event: eventObj } })
    expect(withEvent.findAll('button').some(b => b.text().includes('Customize the e-vite'))).toBe(true)
  })

  it('renders a live preview built from the event + options', async () => {
    const w = await mountSuspended(EventInviteManager, { props: { eventId: 'e', event: eventObj } })
    const iframe = w.find('iframe')
    expect(iframe.exists()).toBe(true)
    const srcdoc = iframe.attributes('srcdoc') ?? ''
    expect(srcdoc).toContain('The Goonies')
    expect(srcdoc).toContain('https://img/goonies.jpg') // poster on by default
  })

  it('saves the e-vite design', async () => {
    saveOptionsFn.mockClear()
    const w = await mountSuspended(EventInviteManager, { props: { eventId: 'e', event: eventObj } })
    // expand the editor, then save
    const trigger = w.findAll('button').find(b => b.text().includes('Customize the e-vite'))
    await trigger!.trigger('click')
    await flushPromises()
    const save = w.findAll('button').find(b => b.text().includes('Save design'))
    await save!.trigger('click')
    await flushPromises()
    expect(saveOptionsFn).toHaveBeenCalledTimes(1)
    expect(toasts.at(-1)?.title).toContain('saved')
  })

  it('manually reminds non-responders on click', async () => {
    const prev = invites.value
    // One e-vited, non-responding guest (rsvp null + sent_at set) → remindable.
    invites.value = [{ ...prev[1]!, rsvp: null, sent_at: 't' }]
    remindFn.mockClear()
    remindFn.mockResolvedValueOnce({ sent: 1, failed: 0, error: null })
    const w = await mountSuspended(EventInviteManager, { props: { eventId: 'e', event: eventObj } })
    await w.findAll('button').find(b => b.text().includes('Remind'))!.trigger('click')
    await flushPromises()
    expect(remindFn).toHaveBeenCalled()
    expect(toasts.at(-1)?.title).toContain('Reminded 1')
    invites.value = prev
  })
})
