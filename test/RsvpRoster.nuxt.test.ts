// @vitest-environment nuxt
import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import RsvpRoster from '../app/components/RsvpRoster.vue'
import type { EventRsvpRoster } from '../app/composables/useEventRsvps'

const roster: EventRsvpRoster = {
  going: [
    { key: 'u1', name: 'Ada', email: 'ada@x.com', avatar: null, status: 'going', viaEmail: false },
    { key: 'g@x.com', name: 'Guest', email: 'g@x.com', avatar: null, status: 'going', viaEmail: true }
  ],
  maybe: [{ key: 'u2', name: 'Bo', email: 'bo@x.com', avatar: null, status: 'maybe', viaEmail: false }],
  no: [],
  noReply: [{ key: 's@x.com', name: 'Silent', email: 's@x.com' }],
  total: 3
}

describe('RsvpRoster', () => {
  it('groups people by status with per-section counts and names', async () => {
    const w = await mountSuspended(RsvpRoster, { props: { roster } })
    expect(w.text()).toContain('Going · 2')
    expect(w.text()).toContain('Maybe · 1')
    expect(w.text()).toContain('Ada')
    expect(w.text()).toContain('Guest')
    expect(w.text()).toContain('Bo')
  })

  it('hides the no-reply section unless asked (admin-only)', async () => {
    const without = await mountSuspended(RsvpRoster, { props: { roster } })
    expect(without.text()).not.toContain('No reply yet')

    const withIt = await mountSuspended(RsvpRoster, { props: { roster, showNoReply: true } })
    expect(withIt.text()).toContain('No reply yet · 1')
    expect(withIt.text()).toContain('Silent')
  })

  it('shows an empty state when nobody has replied', async () => {
    const empty: EventRsvpRoster = { going: [], maybe: [], no: [], noReply: [], total: 0 }
    const w = await mountSuspended(RsvpRoster, { props: { roster: empty } })
    expect(w.text()).toContain('No RSVPs yet')
  })
})
