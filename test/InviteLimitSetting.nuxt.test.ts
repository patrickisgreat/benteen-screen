// @vitest-environment nuxt
import { beforeEach, describe, expect, it } from 'vitest'
import { ref } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import InviteLimitSetting from '../app/components/InviteLimitSetting.vue'

let saved: number | null | undefined
mockNuxtImport('useAppSettings', () => () => ({
  maxInvites: ref<number | null>(10),
  setMaxInvites: async (value: number | null) => { saved = value }
}))
mockNuxtImport('useToast', () => () => ({ add: () => {} }))

beforeEach(() => { saved = undefined })

async function clickSave(w: { findAll: (s: string) => Array<{ text: () => string, trigger: (e: string) => Promise<void> }> }): Promise<void> {
  const btn = w.findAll('button').find(b => b.text().includes('Save'))
  await btn?.trigger('click')
  await flushPromises()
}

describe('InviteLimitSetting', () => {
  it('saves a positive number as the cap', async () => {
    const w = await mountSuspended(InviteLimitSetting)
    await w.find('input').setValue('50')
    await clickSave(w)
    expect(saved).toBe(50)
  })

  it('treats a blank value as unlimited (null)', async () => {
    const w = await mountSuspended(InviteLimitSetting)
    await w.find('input').setValue('')
    await clickSave(w)
    expect(saved).toBeNull()
  })
})
