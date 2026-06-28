// @vitest-environment nuxt
import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import BallotPruneControls from '../app/components/BallotPruneControls.vue'

const cullZeroVotes = vi.fn(async () => 2)
const cullToTop = vi.fn(async () => 3)
mockNuxtImport('useBallotPruning', () => () => ({ cullZeroVotes, cullToTop }))
mockNuxtImport('useToast', () => () => ({ add: () => {} }))

afterEach(() => {
  cullZeroVotes.mockClear()
  cullToTop.mockClear()
  // Teleported modals persist across mounts — clear any leftover dialog buttons.
  document.body.querySelectorAll('[role="dialog"]').forEach(el => el.remove())
})

const bodyButton = (label: string): HTMLElement | undefined =>
  [...document.body.querySelectorAll('button')].find(b => b.textContent?.includes(label))

describe('BallotPruneControls', () => {
  it('cuts zero-vote titles only after the cut is confirmed', async () => {
    const w = await mountSuspended(BallotPruneControls, { props: { eventId: 'e1' } })
    await w.findAll('button').find(b => b.text().includes('Cut zero-vote titles'))?.trigger('click')
    await nextTick()
    // Nothing happens until the confirm.
    expect(cullZeroVotes).not.toHaveBeenCalled()
    bodyButton('Cut titles')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()
    expect(cullZeroVotes).toHaveBeenCalled()
    expect(w.emitted('pruned')?.[0]).toEqual([2])
  })

  it('cuts to the top-N keep count (default 8) on confirm', async () => {
    const w = await mountSuspended(BallotPruneControls, { props: { eventId: 'e1' } })
    await w.findAll('button').find(b => b.text().trim() === 'Cut')?.trigger('click')
    await nextTick()
    bodyButton('Cut titles')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()
    expect(cullToTop).toHaveBeenCalledWith(8)
    expect(w.emitted('pruned')?.[0]).toEqual([3])
  })

  it('does not cut when the confirm is cancelled', async () => {
    const w = await mountSuspended(BallotPruneControls, { props: { eventId: 'e1' } })
    await w.findAll('button').find(b => b.text().includes('Cut zero-vote titles'))?.trigger('click')
    await nextTick()
    bodyButton('Cancel')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()
    expect(cullZeroVotes).not.toHaveBeenCalled()
  })
})
