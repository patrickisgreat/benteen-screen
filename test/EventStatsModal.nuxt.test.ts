// @vitest-environment nuxt
import { beforeEach, describe, expect, it } from 'vitest'
import { ref } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import EventStatsModal from '../app/components/EventStatsModal.vue'
import type { EventStats } from '../shared/utils/eventStats'

const statsRef = ref<EventStats | null>(null)
const pendingRef = ref(false)
const errorRef = ref<string | null>(null)

mockNuxtImport('useEventStats', () => () => ({ stats: statsRef, pending: pendingRef, error: errorRef }))

const stats: EventStats = {
  suggestionCount: 4,
  voteCount: 11,
  submitterCount: 3,
  voterCount: 5,
  going: 6,
  maybe: 1,
  declined: 2,
  bringTotal: 5,
  bringClaimed: 3,
  topPicks: [{ title: 'Heat', votes: 6 }, { title: 'Casino', votes: 5 }]
}

const event = (locked = false) => ({
  id: 'e1',
  title: 'Movie Night',
  description: '',
  event_date: '2026-07-01',
  start_time: null,
  location: null,
  location_url: null,
  poster_url: null,
  voting_locked_at: locked ? '2026-07-02T00:00:00Z' : null,
  created_at: ''
})

const bodyText = (): string => document.body.textContent ?? ''

beforeEach(() => {
  document.body.innerHTML = ''
  statsRef.value = null
  pendingRef.value = false
  errorRef.value = null
})

describe('EventStatsModal', () => {
  it('renders the headline counts, rsvp split, bring progress and top picks', async () => {
    statsRef.value = stats
    await mountSuspended(EventStatsModal, { props: { event: event(), open: true } })
    await flushPromises()
    const text = bodyText()
    expect(text).toContain('Movie Night')
    expect(text).toContain('Heat')
    expect(text).toContain('Casino')
    expect(text).toContain('3 of 5') // bring claimed/total
    expect(text).toContain('Leading') // not locked
  })

  it('labels the top picks as winners once voting is locked', async () => {
    statsRef.value = stats
    await mountSuspended(EventStatsModal, { props: { event: event(true), open: true } })
    await flushPromises()
    expect(bodyText()).toContain('Winners')
    expect(bodyText()).not.toContain('Leading')
  })

  it('shows a loading state while pending', async () => {
    pendingRef.value = true
    await mountSuspended(EventStatsModal, { props: { event: event(), open: true } })
    await flushPromises()
    expect(bodyText()).toContain('Loading')
  })
})
