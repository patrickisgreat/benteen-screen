// @vitest-environment nuxt
import { beforeEach, describe, expect, it } from 'vitest'
import { ref } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import UserStatsModal from '../app/components/UserStatsModal.vue'
import type { UserStats } from '../shared/utils/userStats'

const statsRef = ref<UserStats | null>(null)
const pendingRef = ref(false)
const errorRef = ref<string | null>(null)

mockNuxtImport('useUserStats', () => () => ({ stats: statsRef, pending: pendingRef, error: errorRef }))

const person = { id: 'u1', email: 'alice@x.com', display_name: 'Alice', avatar_url: null, is_admin: false, blocked: false, created_at: '' }

const fullStats: UserStats = {
  going: 3,
  maybe: 1,
  declined: 2,
  votesCast: 9,
  submitted: [
    { id: 's1', eventId: 'e1', title: 'Heat', won: true },
    { id: 's2', eventId: 'e2', title: 'Casino', won: false }
  ],
  wins: 1,
  brought: ['Chips', 'Drinks']
}

// UModal teleports its body to <body>; assert against the document, not the wrapper.
const bodyText = (): string => document.body.textContent ?? ''

beforeEach(() => {
  document.body.innerHTML = ''
  statsRef.value = null
  pendingRef.value = false
  errorRef.value = null
})

describe('UserStatsModal', () => {
  it('shows RSVP and voting tallies plus suggested movies and brought items', async () => {
    statsRef.value = fullStats
    await mountSuspended(UserStatsModal, { props: { person, open: true } })
    await flushPromises()
    const text = bodyText()
    expect(text).toContain('Alice')
    expect(text).toContain('Heat')
    expect(text).toContain('Casino')
    expect(text).toContain('Chips')
    expect(text).toContain('Drinks')
    expect(text).toContain('won')
  })

  it('shows a loading state while stats are pending', async () => {
    pendingRef.value = true
    await mountSuspended(UserStatsModal, { props: { person, open: true } })
    await flushPromises()
    expect(bodyText()).toContain('Loading')
  })

  it('surfaces an error message', async () => {
    errorRef.value = 'boom'
    await mountSuspended(UserStatsModal, { props: { person, open: true } })
    await flushPromises()
    expect(bodyText()).toContain('boom')
  })
})
