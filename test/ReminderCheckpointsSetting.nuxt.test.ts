// @vitest-environment nuxt
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import ReminderCheckpointsSetting from '../app/components/ReminderCheckpointsSetting.vue'

const setReminderDays = vi.fn()
const toastAdd = vi.fn()
mockNuxtImport('useAppSettings', () => () => ({
  reminderDays: ref<number[]>([7, 3, 1]),
  setReminderDays
}))
mockNuxtImport('useToast', () => () => ({ add: toastAdd }))

beforeEach(() => {
  setReminderDays.mockReset()
  setReminderDays.mockResolvedValue(undefined)
  toastAdd.mockReset()
})

const clickSave = (w: Awaited<ReturnType<typeof mountSuspended>>): Promise<void> =>
  w.findAll('button').find(b => b.text() === 'Save')!.trigger('click')

describe('ReminderCheckpointsSetting', () => {
  it('hydrates the field from the current checkpoints', async () => {
    const w = await mountSuspended(ReminderCheckpointsSetting)
    expect(w.find('input').element.value).toBe('7, 3, 1')
  })

  it('parses, sorts, and saves the edited checkpoints', async () => {
    const w = await mountSuspended(ReminderCheckpointsSetting)
    await w.find('input').setValue('1, 5, 5, 10')
    await clickSave(w)
    expect(setReminderDays).toHaveBeenCalledWith([10, 5, 1])
  })

  it('saves an empty list (reminders off) for a blank field', async () => {
    const w = await mountSuspended(ReminderCheckpointsSetting)
    await w.find('input').setValue('')
    await clickSave(w)
    expect(setReminderDays).toHaveBeenCalledWith([])
  })

  it('surfaces an error toast when the save fails', async () => {
    setReminderDays.mockRejectedValueOnce(new Error('boom'))
    const w = await mountSuspended(ReminderCheckpointsSetting)
    await clickSave(w)
    expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({ color: 'error' }))
  })
})
