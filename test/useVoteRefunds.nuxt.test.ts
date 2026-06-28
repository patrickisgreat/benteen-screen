// @vitest-environment nuxt
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'

const rpc = vi.fn<(fn: string, args: Record<string, unknown>) => Promise<{ data: { suggestion_id: string, title: string | null }[] | null, error: unknown }>>(
  () => Promise.resolve({ data: [], error: null })
)
const add = vi.fn()
mockNuxtImport('useSupabaseClient', () => () => ({ rpc }))
mockNuxtImport('useToast', () => () => ({ add }))

beforeEach(() => {
  rpc.mockClear()
  add.mockClear()
  rpc.mockResolvedValue({ data: [], error: null })
})

describe('useVoteRefunds', () => {
  it('toasts once per freed pick on load', async () => {
    rpc.mockResolvedValueOnce({
      data: [{ suggestion_id: 's1', title: 'Heat' }, { suggestion_id: 's2', title: 'Jaws' }],
      error: null
    })
    useVoteRefunds(ref('e1'))
    await flushPromises()
    expect(rpc).toHaveBeenCalledWith('claim_freed_votes', { p_event_id: 'e1' })
    expect(add).toHaveBeenCalledTimes(2)
    expect(add.mock.calls[0]![0]).toMatchObject({ description: expect.stringContaining('Heat') })
  })

  it('does nothing when there are no freed votes', async () => {
    useVoteRefunds(ref('e1'))
    await flushPromises()
    expect(add).not.toHaveBeenCalled()
  })

  it('does not call the RPC without an event id', async () => {
    useVoteRefunds(ref(null))
    await flushPromises()
    expect(rpc).not.toHaveBeenCalled()
  })

  it('stays quiet when the RPC errors', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'nope' } })
    useVoteRefunds(ref('e1'))
    await flushPromises()
    expect(add).not.toHaveBeenCalled()
  })
})
