// @vitest-environment nuxt
import { describe, expect, it, vi } from 'vitest'
import { computed, ref } from 'vue'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import EventInviteManager from '../app/components/EventInviteManager.vue'

const invites = ref([
  { id: 'a', event_id: 'e', email: 'pat@x.com', display_name: 'Pat', token: '1', rsvp: 'going', rsvp_at: null, invited_by: null, resend_id: null, sent_at: 't', delivered_at: null, opened_at: null, clicked_at: null, bounced_at: null, created_at: '' }
])
const sent = vi.fn(async () => ({ sent: 0 }))

mockNuxtImport('useEventInvites', () => () => ({
  invites,
  pending: ref(false),
  stats: computed(() => ({ invited: 1, sent: 1, opened: 0, clicked: 0, going: 1, maybe: 0, no: 0, noReply: 0 })),
  refresh: async () => {},
  addInvite: async () => {},
  removeInvite: async () => {},
  seedFromLastEvent: async () => 0,
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
})
