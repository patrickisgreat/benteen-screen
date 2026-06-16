// @vitest-environment nuxt
import { beforeEach, describe, expect, it } from 'vitest'
import { ref } from 'vue'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { DEFAULT_INVITE_OPTIONS } from '../shared/types/invite-options'

interface UpdateCall { payload: Record<string, unknown>, filters: Record<string, unknown> }
const calls = { updates: [] as UpdateCall[] }

const supabase = {
  from() {
    return {
      update: (payload: Record<string, unknown>) => {
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
    }
  }
}

mockNuxtImport('useSupabaseClient', () => () => supabase)

beforeEach(() => {
  calls.updates = []
})

describe('useInviteOptions', () => {
  it('saves the options onto the event row', async () => {
    const { save } = useInviteOptions(ref('e1'))
    await save({ ...DEFAULT_INVITE_OPTIONS, theme: 'neon', message: 'hi' })
    expect(calls.updates).toHaveLength(1)
    expect(calls.updates[0]!.filters).toEqual({ id: 'e1' })
    expect(calls.updates[0]!.payload.invite_options).toMatchObject({ theme: 'neon', message: 'hi' })
  })

  it('is a no-op without an event id', async () => {
    const { save } = useInviteOptions(ref(null))
    await save(DEFAULT_INVITE_OPTIONS)
    expect(calls.updates).toHaveLength(0)
  })
})
