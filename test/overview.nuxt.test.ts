// @vitest-environment nuxt
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'
import { flushPromises } from '@vue/test-utils'
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
const myStatus = ref<string | null>(null)
const setStatus = vi.fn(async () => {})
const suggestionList = ref<Array<Record<string, unknown>>>([])
// Admin-configured caps (null = fall back to the limits.ts defaults).
const cfgMaxSuggestions = ref<number | null>(null)
const cfgMaxVotes = ref<number | null>(null)

mockNuxtImport('useAuth', () => () => ({ isAdmin, myId }))
mockNuxtImport('useEvents', () => () => ({ events: ref([event]) }))
mockNuxtImport('useTmdb', () => () => ({ posterUrl: () => null }))
mockNuxtImport('useSuggestions', () => () => ({
  suggestions: suggestionList,
  refresh: async () => {},
  alreadySuggested: () => false,
  suggest: async () => {},
  vote: async () => {},
  unvote: async () => {},
  removeSuggestion: async () => {}
}))
mockNuxtImport('useRsvp', () => () => ({
  myStatus,
  myPlusOnes: ref(0),
  counts: ref({ going: 0, maybe: 0, no: 0, guests: 0 }),
  setStatus,
  setGuests: async () => {}
}))
mockNuxtImport('useToast', () => () => ({ add: () => {} }))
mockNuxtImport('useAppSettings', () => () => ({
  maxSuggestions: cfgMaxSuggestions,
  maxVotes: cfgMaxVotes
}))
mockNuxtImport('usePresence', () => () => ({ online: ref([]) }))

// Heavy children pull in their own composables/network — stub them; this page
// test only cares about the header + the admin-gated selector.
const stubs = {
  RsvpControl: true,
  SuggestSection: true,
  MovieFinder: true,
  SuggestionCard: true,
  EventInfoModal: true,
  TrailerModal: true,
  WhoOnline: true
}

const UPCOMING = '2999-07-15T19:00:00Z'

beforeEach(() => {
  isAdmin.value = false
  myId.value = null
  myStatus.value = 'going'
  setStatus.mockClear()
  suggestionList.value = []
  cfgMaxSuggestions.value = null
  cfgMaxVotes.value = null
  // Some tests flip the date to the past; reset to upcoming each time.
  event.event_date = UPCOMING
})

// Use the real RsvpControl so we can click a status button to trigger the leave
// flow; GuestStepper stays stubbed (it pulls its own bits).
const rsvpStubs = { ...stubs, RsvpControl: false as const, GuestStepper: true }

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

  it('prompts to RSVP and hides the suggest controls when not going', async () => {
    myStatus.value = null
    const w = await mountSuspended(OverviewPage, { global: { stubs } })
    expect(w.text()).toContain('RSVP to join in')
    // The suggestion-count line and suggest controls only appear once going.
    expect(w.text()).not.toContain('suggestions used')
    expect(w.text()).not.toContain('Suggest a movie')
  })

  it('shows the suggest controls once I am going', async () => {
    myId.value = 'me'
    myStatus.value = 'going'
    const w = await mountSuspended(OverviewPage, { global: { stubs } })
    expect(w.text()).toContain('0 of 5 suggestions used')
    expect(w.text()).not.toContain('RSVP to join in')
  })

  it('does not show the RSVP prompt for a past event (no RSVP control to act on)', async () => {
    // RsvpControl is upcoming-only, so a dead-end "RSVP to join in" prompt would
    // be misleading on a past-but-unlocked event — it must stay hidden.
    event.event_date = '2000-01-01T19:00:00Z'
    myStatus.value = null
    const w = await mountSuspended(OverviewPage, { global: { stubs } })
    expect(w.text()).not.toContain('RSVP to join in')
  })

  it('warns before leaving “going” when I have suggestions or votes', async () => {
    myId.value = 'me'
    myStatus.value = 'going'
    suggestionList.value = [mineSuggestion(1)] // mySuggestionCount = 1
    const w = await mountSuspended(OverviewPage, { global: { stubs: rsvpStubs } })
    await w.findAll('button').find(b => b.text().includes('Maybe'))?.trigger('click')
    await nextTick()
    // Doesn't leave yet — a confirmation appears instead.
    expect(setStatus).not.toHaveBeenCalled()
    expect(document.body.textContent).toContain('Hide my stuff')
  })

  it('leaves immediately when there is nothing to hide', async () => {
    myId.value = 'me'
    myStatus.value = 'going'
    suggestionList.value = [] // no suggestions, no votes
    const w = await mountSuspended(OverviewPage, { global: { stubs: rsvpStubs } })
    await w.findAll('button').find(b => b.text().includes('Maybe'))?.trigger('click')
    await flushPromises()
    expect(setStatus).toHaveBeenCalledWith('maybe')
  })

  it('hides my stuff once I confirm leaving', async () => {
    myId.value = 'me'
    myStatus.value = 'going'
    suggestionList.value = [mineSuggestion(1)]
    const w = await mountSuspended(OverviewPage, { global: { stubs: rsvpStubs } })
    await w.findAll('button').find(b => b.text().includes('Maybe'))?.trigger('click')
    await nextTick()
    const confirm = [...document.body.querySelectorAll('button')].find(b => b.textContent?.includes('Hide my stuff'))
    confirm?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()
    expect(setStatus).toHaveBeenCalledWith('maybe')
  })
})
