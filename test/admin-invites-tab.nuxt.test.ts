// @vitest-environment nuxt
import { beforeEach, describe, expect, it } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import AdminPage from '../app/pages/admin.vue'
import type { MovieEvent } from '../shared/types/event'

// Which UI the Invites tab shows is the whole feature: a per-event guest list when
// a night is scheduled, the club-roster composer when the club is between
// screenings. Mount the real page and assert the swap.
const events = ref<MovieEvent[]>([])

const at = (offsetDays: number, id: string): MovieEvent => ({
  id,
  title: `Night ${id}`,
  event_date: new Date(Date.now() + offsetDays * 86_400_000).toISOString()
} as MovieEvent)

mockNuxtImport('useEvents', () => () => ({ events }))
mockNuxtImport('useEventAdmin', () => () => ({
  createEvent: async () => {}, updateEvent: async () => {}, deleteEvent: async () => {}, setVotingLocked: async () => {}
}))
mockNuxtImport('useAdminPeople', () => () => ({
  people: ref([]), pendingInvites: ref([]), pending: ref(false), loadError: ref(null),
  setBlocked: async () => {}, setAdmin: async () => {}, revokeInvite: async () => {}
}))
mockNuxtImport('useAdminSuggestions', () => () => ({ suggestions: ref([]), refresh: async () => {}, setDeleted: async () => {} }))
mockNuxtImport('useCulledSuggestions', () => () => ({ culled: ref([]) }))
mockNuxtImport('useBringList', () => () => ({ items: ref([]), addItem: async () => {}, updateItem: async () => {}, remove: async () => {} }))
mockNuxtImport('useRsvp', () => () => ({ counts: ref({ going: 0, maybe: 0, no: 0 }) }))
mockNuxtImport('useCommsLog', () => () => ({ entries: ref([]) }))
mockNuxtImport('useEventRsvps', () => () => ({ roster: ref([]), counts: ref({ going: 0, maybe: 0, no: 0 }) }))
mockNuxtImport('useRoster', () => () => ({
  roster: ref([]), pending: ref(false), pendingCount: computed(() => 0),
  existingEmails: computed(() => new Set<string>()), loadError: ref(null),
  refresh: async () => {}, addToRoster: async () => ({ added: 0, skipped: 0, emailed: 0, failed: 0, invalid: [], error: null })
}))
mockNuxtImport('useToast', () => () => ({ add: () => {} }))

// The page mounts every panel at once; stub the children that open their own
// Supabase queries so the mount stays about the Invites tab and nothing else.
// RosterInviteComposer is deliberately NOT stubbed — it's what we assert on.
//
// UTabs is stubbed to render only the `invites` slot: Reka's tab triggers don't
// activate on a jsdom click, and this asserts the thing that actually matters —
// what admin.vue puts in that slot for a given schedule.
const stubs = {
  UTabs: { template: '<div><slot name="invites" /></div>' },
  UserStatsModal: true,
  EventStatsModal: true,
  EventInviteManager: true,
  EventAnnounceComposer: true,
  CommsLog: true,
  AdminSuggestionDashboard: true,
  CulledList: true,
  PeopleList: true,
  BringList: true,
  InviteFriendModal: true,
  InviteToEventModal: true,
  InviteLimitSetting: true,
  ParticipationLimitsSetting: true,
  ReminderCheckpointsSetting: true,
  BallotPruneControls: true
}

/** Mount the admin page and return the rendered text of its Invites tab. */
async function invitesTabText(): Promise<string> {
  const wrapper = await mountSuspended(AdminPage, { global: { stubs } })
  await flushPromises()
  return wrapper.text()
}

beforeEach(() => {
  events.value = []
})

describe('admin Invites tab', () => {
  it('offers club-roster seeding when nothing is scheduled', async () => {
    events.value = [at(-10, 'past')]
    const text = await invitesTabText()
    expect(text).toContain('between screenings')
  })

  it('offers roster seeding when there are no events at all', async () => {
    const text = await invitesTabText()
    expect(text).toContain('between screenings')
  })

  it('shows the per-event guest list once a night is scheduled', async () => {
    events.value = [at(-10, 'past'), at(7, 'next')]
    const text = await invitesTabText()
    expect(text).not.toContain('between screenings')
    expect(text).toContain('auto-fills from the last movie night')
  })
})
