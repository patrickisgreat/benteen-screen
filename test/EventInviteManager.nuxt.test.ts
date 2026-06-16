// @vitest-environment nuxt
import { describe, expect, it, vi } from 'vitest'
import { computed, ref } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import EventInviteManager from '../app/components/EventInviteManager.vue'

const invites = ref([
  { id: 'a', event_id: 'e', email: 'pat@x.com', display_name: 'Pat', token: '1', rsvp: 'going', rsvp_at: null, invited_by: null, resend_id: null, sent_at: 't', delivered_at: null, opened_at: null, clicked_at: null, bounced_at: null, created_at: '' },
  { id: 'b', event_id: 'e', email: 'sam@x.com', display_name: 'Sam', token: '2', rsvp: null, rsvp_at: null, invited_by: null, resend_id: null, sent_at: null, delivered_at: null, opened_at: null, clicked_at: null, bounced_at: null, created_at: '' }
])
const sent = vi.fn(async () => ({ sent: 0 }))
const removeMany = vi.fn(async () => {})
const seedFn = vi.fn(async () => 0)

mockNuxtImport('useEventInvites', () => () => ({
  invites,
  pending: ref(false),
  stats: computed(() => ({ invited: 2, sent: 1, opened: 0, clicked: 0, going: 1, maybe: 0, no: 0, noReply: 1 })),
  refresh: async () => {},
  addInvite: async () => {},
  removeInvite: async () => {},
  removeInvites: removeMany,
  seedFromLastEvent: seedFn,
  sendInvites: sent
}))
mockNuxtImport('useToast', () => () => ({ add: () => {} }))

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
})
