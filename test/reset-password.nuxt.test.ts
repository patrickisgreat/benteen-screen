// @vitest-environment nuxt
import { beforeEach, describe, expect, it } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import ResetPasswordPage from '../app/pages/reset-password.vue'

const updateCalls: Array<{ password: string }> = []
let navTarget: string | null = null

mockNuxtImport('useSupabaseClient', () => () => ({
  auth: {
    updateUser: async (args: { password: string }) => { updateCalls.push(args); return { error: null } }
  }
}))
mockNuxtImport('useToast', () => () => ({ add: () => {} }))
mockNuxtImport('navigateTo', () => (to: string) => { navTarget = to; return to })

beforeEach(() => {
  updateCalls.length = 0
  navTarget = null
})

describe('reset-password page', () => {
  it('sets the new password and continues into the app', async () => {
    const w = await mountSuspended(ResetPasswordPage)
    await w.find('input[type="password"]').setValue('newsecret8')
    await w.find('form').trigger('submit')
    await flushPromises()
    expect(updateCalls[0]?.password).toBe('newsecret8')
    expect(navTarget).toBe('/overview')
  })

  it('does not submit a too-short password', async () => {
    const w = await mountSuspended(ResetPasswordPage)
    await w.find('input[type="password"]').setValue('short')
    await w.find('form').trigger('submit')
    await flushPromises()
    expect(updateCalls).toHaveLength(0)
  })
})
