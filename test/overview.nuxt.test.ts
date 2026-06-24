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

// Shared state — flipped per test before mounting (mockNuxtImport allows
// referencing module-scope values, same pattern as useAdminPeople.nuxt.test.ts).
const isAdmin = ref(false)
const myId = ref<string | null>(null)
const suggestionList = ref<Array<Record<string, unknown>>>([])
// Admin-configured caps (null = fall back to the limits.ts defaults).
const cfgMaxSuggestions = ref<number | null>(null)
const cfgMaxVotes = ref<number | null>(null)

mockNuxtImport('useAuth', () => () => ({ isAdmin, myId }))
mockNuxtImport('useEvents', () => () => ({ events: ref([event]) }))
mockNuxtImport('useTmdb', () => () => ({ posterUrl: () => null }))
mockNuxtImport('useSuggestions', () => () => ({
  suggestions: suggestionList,
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
mockNuxtImport('useAppSettings', () => () => ({
  maxSuggestions: cfgMaxSuggestions,
  maxVotes: cfgMaxVotes
}))

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
  myId.value = null
  suggestionList.value = []
  cfgMaxSuggestions.value = null
  cfgMaxVotes.value = null
})

function mineSuggestion(i: number): Record<string, unknown> {
  return { id: `s${i}`, event_id: 'e1', user_id: 'me', tmdb_movie: { id: i, title: `M${i}` }, deleted: false, created_at: '2026-01-01', votes: [] }
}

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

  it('shows the suggestion-cap notice once I have 5 suggestions', async () => {
    myId.value = 'me'
    suggestionList.value = [1, 2, 3, 4, 5].map(mineSuggestion)
    const w = await mountSuspended(OverviewPage, { global: { stubs } })
    expect(w.text()).toContain('5 of 5 suggestions used')
    expect(w.text()).toContain('used all 5 suggestions')
  })

  it('honors an admin-configured suggestion cap over the default', async () => {
    cfgMaxSuggestions.value = 2
    myId.value = 'me'
    suggestionList.value = [1, 2].map(mineSuggestion)
    const w = await mountSuspended(OverviewPage, { global: { stubs } })
    // The cap notice fires at 2 (the configured value), not the default of 5.
    expect(w.text()).toContain('2 of 2 suggestions used')
    expect(w.text()).toContain('used all 2 suggestions')
  })
})
