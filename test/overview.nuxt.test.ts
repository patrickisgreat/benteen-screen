// @vitest-environment nuxt
import { beforeEach, describe, expect, it } from 'vitest'
import { ref } from 'vue'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import OverviewPage from '../app/pages/overview.vue'

const event = {
  id: 'e1',
  title: 'Movie Night',
  description: '',
  event_date: '2999-07-15T19:00:00Z',
  start_time: null,
  location: null,
  location_url: null,
  poster_url: null,
  created_at: ''
}

// Shared admin flag — flipped per test before mounting (mockNuxtImport allows
// referencing module-scope values, same pattern as useAdminPeople.nuxt.test.ts).
const isAdmin = ref(false)

mockNuxtImport('useAuth', () => () => ({ isAdmin }))
mockNuxtImport('useEvents', () => () => ({ events: ref([event]) }))
mockNuxtImport('useTmdb', () => () => ({ posterUrl: () => null }))
mockNuxtImport('useSuggestions', () => () => ({
  suggestions: ref([]),
  alreadySuggested: () => false,
  suggest: async () => {},
  vote: async () => {},
  unvote: async () => {},
  removeSuggestion: async () => {}
}))
mockNuxtImport('useRsvp', () => () => ({
  myStatus: ref(null),
  counts: ref({ going: 0, maybe: 0, no: 0 }),
  setStatus: async () => {}
}))
mockNuxtImport('useToast', () => () => ({ add: () => {} }))

// Heavy children pull in their own composables/network — stub them; this page
// test only cares about the header + the admin-gated selector.
const stubs = {
  RsvpControl: true,
  SuggestSection: true,
  MovieFinder: true,
  SuggestionCard: true,
  EventInfoModal: true,
  TrailerModal: true
}

beforeEach(() => {
  isAdmin.value = false
})

describe('overview page', () => {
  it('renders the active event in the poster header', async () => {
    const w = await mountSuspended(OverviewPage, { global: { stubs } })
    expect(w.text()).toContain('Movie Night')
  })

  it('hides the event/date selector for non-admins', async () => {
    isAdmin.value = false
    const w = await mountSuspended(OverviewPage, { global: { stubs } })
    expect(w.find('[aria-label="Previous event"]').exists()).toBe(false)
  })

  it('shows the event/date selector for admins', async () => {
    isAdmin.value = true
    const w = await mountSuspended(OverviewPage, { global: { stubs } })
    expect(w.find('[aria-label="Previous event"]').exists()).toBe(true)
  })

  it('no longer mentions pizza dough in the RSVP card', async () => {
    const w = await mountSuspended(OverviewPage, { global: { stubs } })
    expect(w.text().toLowerCase()).not.toContain('pizza dough')
    expect(w.text()).toContain('See the bring list')
  })
})
