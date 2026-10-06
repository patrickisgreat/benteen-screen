// @vitest-environment nuxt
import { beforeEach, describe, expect, it } from 'vitest'
import { ref } from 'vue'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { fakeApi } from './utils/fakeApi'

interface UpdateCall { payload: Record<string, unknown>, filters: Record<string, unknown> }
const calls = { updates: [] as UpdateCall[] }

const filteredChain = (payload: Record<string, unknown>) => {
  const filters: Record<string, unknown> = {}
  const chain = {
    eq: (col: string, val: unknown) => {
      filters[col] = val
      return chain
    },
    then: (onFulfilled: (r: { error: null }) => unknown) => {
      calls.updates.push({ payload, filters })
      return Promise.resolve({ error: null }).then(onFulfilled)
    }
  }
  return chain
}

const supabase = {
  from() {
    return { update: (payload: Record<string, unknown>) => filteredChain(payload) }
  }
}

const api = fakeApi(['/api/events/e1/reschedule', '/api/events/e1/reschedule-audience'], call => (
  call.url.endsWith('audience')
    ? { total: 3, going: 1, maybe: 0, declined: 0, noReply: 2, sample: null }
    : { ok: true, moved: true, sent: 3, failed: 0, error: null }
))

mockNuxtImport('useSupabaseClient', () => () => supabase)
mockNuxtImport('useSupabaseUser', () => () => ref({ id: 'me' }))

beforeEach(() => {
  calls.updates = []
  api.reset()
})

describe('useEventAdmin rescheduling', () => {
  it('asks the server who a date change would email', async () => {
    const { rescheduleAudience } = useEventAdmin()
    expect(await rescheduleAudience('e1')).toMatchObject({ total: 3, going: 1 })
    expect(api.calls[0]).toMatchObject({ url: '/api/events/e1/reschedule-audience', method: 'GET' })
  })

  it('moves the event through the server route and reports who was emailed', async () => {
    const { rescheduleEvent } = useEventAdmin()
    const request = { eventDate: '2026-10-18T04:00:00.000Z', startTime: '8pm', note: 'Rain', notify: true }
    expect(await rescheduleEvent('e1', request)).toEqual({ sent: 3, failed: 0, error: null })
    expect(api.calls[0]).toMatchObject({ url: '/api/events/e1/reschedule', method: 'POST', body: request })
  })
})

describe('useEventAdmin.setVotingLocked', () => {
  it('stamps voting_locked_at on the event when locking', async () => {
    const { setVotingLocked } = useEventAdmin()
    await setVotingLocked('e1', true)
    expect(calls.updates).toHaveLength(1)
    expect(calls.updates[0]!.filters).toEqual({ id: 'e1' })
    expect(typeof calls.updates[0]!.payload.voting_locked_at).toBe('string')
    // a real ISO timestamp, not null
    expect(calls.updates[0]!.payload.voting_locked_at).not.toBeNull()
  })

  it('clears voting_locked_at when reopening', async () => {
    const { setVotingLocked } = useEventAdmin()
    await setVotingLocked('e1', false)
    expect(calls.updates[0]).toEqual({ payload: { voting_locked_at: null }, filters: { id: 'e1' } })
  })
})
