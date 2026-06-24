// @vitest-environment nuxt
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import ParticipationLimitsSetting from '../app/components/ParticipationLimitsSetting.vue'

const setParticipationCaps = vi.fn()
const toastAdd = vi.fn()
mockNuxtImport('useAppSettings', () => () => ({
  maxSuggestions: ref<number | null>(7),
  maxVotes: ref<number | null>(4),
  setParticipationCaps
}))
mockNuxtImport('useToast', () => () => ({ add: toastAdd }))

beforeEach(() => {
  setParticipationCaps.mockReset()
  setParticipationCaps.mockResolvedValue(undefined)
  toastAdd.mockReset()
})

async function clickSave(w: Awaited<ReturnType<typeof mountSuspended>>): Promise<void> {
  await w.findAll('button').find(b => b.text() === 'Save')!.trigger('click')
}

describe('ParticipationLimitsSetting', () => {
  it('renders a number input for each cap', async () => {
    const w = await mountSuspended(ParticipationLimitsSetting)
    expect(w.findAll('input[type="number"]').length).toBe(2)
    expect(w.text()).toContain('Suggestions per person')
    expect(w.text()).toContain('Votes per person')
  })

  it('saves both drafts in a single atomic call', async () => {
    const w = await mountSuspended(ParticipationLimitsSetting)
    await clickSave(w)
    // Drafts hydrate from the (mocked) current values: 7 suggestions, 4 votes.
    expect(setParticipationCaps).toHaveBeenCalledWith(7, 4)
  })

  it('normalizes a blank field to null (= use the default)', async () => {
    const w = await mountSuspended(ParticipationLimitsSetting)
    const [suggestions, votes] = w.findAll('input[type="number"]')
    await suggestions!.setValue('')
    await votes!.setValue('')
    await clickSave(w)
    expect(setParticipationCaps).toHaveBeenCalledWith(null, null)
  })

  it('rejects zero and negative caps, coercing them to null', async () => {
    const w = await mountSuspended(ParticipationLimitsSetting)
    const [suggestions, votes] = w.findAll('input[type="number"]')
    await suggestions!.setValue('0')
    await votes!.setValue('-3')
    await clickSave(w)
    expect(setParticipationCaps).toHaveBeenCalledWith(null, null)
  })

  it('floors a fractional cap to a whole number', async () => {
    const w = await mountSuspended(ParticipationLimitsSetting)
    const [suggestions, votes] = w.findAll('input[type="number"]')
    await suggestions!.setValue('3.9')
    await votes!.setValue('2.2')
    await clickSave(w)
    expect(setParticipationCaps).toHaveBeenCalledWith(3, 2)
  })

  it('surfaces an error toast when the save fails', async () => {
    setParticipationCaps.mockRejectedValueOnce(new Error('boom'))
    const w = await mountSuspended(ParticipationLimitsSetting)
    await clickSave(w)
    expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({ color: 'error' }))
  })

  it('confirms a successful save with a success toast', async () => {
    const w = await mountSuspended(ParticipationLimitsSetting)
    await clickSave(w)
    expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({ color: 'success' }))
  })
})
