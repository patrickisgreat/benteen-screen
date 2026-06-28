// @vitest-environment nuxt
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'

const rpc = vi.fn<(fn: string, args: Record<string, unknown>) => Promise<{ data: number | null, error: { message: string } | null }>>(
  () => Promise.resolve({ data: 0, error: null })
)
const supabase = { rpc }
mockNuxtImport('useSupabaseClient', () => () => supabase)

beforeEach(() => {
  rpc.mockClear()
  rpc.mockResolvedValue({ data: 0, error: null })
})

describe('useBallotPruning', () => {
  it('cullZeroVotes calls the cull_zero_votes RPC with the event id', async () => {
    rpc.mockResolvedValueOnce({ data: 3, error: null })
    const { cullZeroVotes } = useBallotPruning(ref('e1'))
    const cut = await cullZeroVotes()
    expect(rpc).toHaveBeenCalledWith('cull_zero_votes', { p_event_id: 'e1' })
    expect(cut).toBe(3)
  })

  it('cullToTop passes the keep count through', async () => {
    rpc.mockResolvedValueOnce({ data: 5, error: null })
    const { cullToTop } = useBallotPruning(ref('e1'))
    const cut = await cullToTop(8)
    expect(rpc).toHaveBeenCalledWith('cull_to_top', { p_event_id: 'e1', p_keep: 8 })
    expect(cut).toBe(5)
  })

  it('is a no-op (no RPC) when there is no event id', async () => {
    const { cullZeroVotes } = useBallotPruning(ref(null))
    expect(await cullZeroVotes()).toBe(0)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('throws when the RPC errors', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'only admins may prune the ballot' } })
    const { cullToTop } = useBallotPruning(ref('e1'))
    await expect(cullToTop(4)).rejects.toMatchObject({ message: 'only admins may prune the ballot' })
  })
})
