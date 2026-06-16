// @vitest-environment nuxt
import { beforeEach, describe, expect, it } from 'vitest'
import { ref } from 'vue'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'

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

mockNuxtImport('useSupabaseClient', () => () => supabase)
mockNuxtImport('useSupabaseUser', () => () => ref({ id: 'me' }))

beforeEach(() => {
  calls.updates = []
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
