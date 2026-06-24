// @vitest-environment nuxt
import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import ParticipationLimitsSetting from '../app/components/ParticipationLimitsSetting.vue'

const setParticipationCaps = vi.fn()
mockNuxtImport('useAppSettings', () => () => ({
  maxSuggestions: ref<number | null>(7),
  maxVotes: ref<number | null>(4),
  setParticipationCaps
}))
mockNuxtImport('useToast', () => () => ({ add: () => {} }))

describe('ParticipationLimitsSetting', () => {
  it('renders a number input for each cap', async () => {
    const w = await mountSuspended(ParticipationLimitsSetting)
    expect(w.findAll('input[type="number"]').length).toBe(2)
    expect(w.text()).toContain('Suggestions per person')
    expect(w.text()).toContain('Votes per person')
  })

  it('saves both drafts in a single atomic call', async () => {
    const w = await mountSuspended(ParticipationLimitsSetting)
    await w.findAll('button').find(b => b.text() === 'Save')!.trigger('click')
    // Drafts hydrate from the (mocked) current values: 7 suggestions, 4 votes.
    expect(setParticipationCaps).toHaveBeenCalledWith(7, 4)
  })
})
