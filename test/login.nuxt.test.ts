// @vitest-environment nuxt
import { beforeEach, describe, expect, it } from 'vitest'
import { ref } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import LoginPage from '../app/pages/login.vue'

const calls: string[] = []
const auth = {
  user: ref<unknown>(null),
  signInWithGoogle: async () => { calls.push('google') },
  signInWithFacebook: async () => { calls.push('facebook') },
  signInWithEmail: async (email: string) => { calls.push(`email:${email}`) },
  signUpWithEmail: async (email: string) => { calls.push(`signup:${email}`); return { needsConfirmation: true } },
  sendPasswordReset: async (email: string) => { calls.push(`reset:${email}`) }
}

mockNuxtImport('useAuth', () => () => auth)
mockNuxtImport('useToast', () => () => ({ add: () => {} }))

beforeEach(() => {
  calls.length = 0
  auth.user.value = null
})

describe('login page', () => {
  it('offers both Google and Facebook sign-in', async () => {
    const w = await mountSuspended(LoginPage)
    const labels = w.findAll('button').map(b => b.text())
    expect(labels.some(t => t.includes('Google'))).toBe(true)
    expect(labels.some(t => t.includes('Facebook'))).toBe(true)
  })

  it('starts Facebook OAuth when its button is clicked', async () => {
    const w = await mountSuspended(LoginPage)
    const fb = w.findAll('button').find(b => b.text().includes('Facebook'))
    await fb?.trigger('click')
    expect(calls).toContain('facebook')
  })

  it('toggles between sign-in and sign-up', async () => {
    const w = await mountSuspended(LoginPage)
    expect(w.text()).toContain('Welcome back')
    const toggle = w.findAll('button').find(b => b.text().includes('Create an account'))
    await toggle?.trigger('click')
    expect(w.text()).toContain('Create your account')
  })

  it('signs in with email + password on submit', async () => {
    const w = await mountSuspended(LoginPage)
    await w.find('input[type="email"]').setValue('a@b.com')
    await w.find('input[type="password"]').setValue('secret12')
    await w.find('form').trigger('submit')
    await flushPromises()
    expect(calls).toContain('email:a@b.com')
  })

  it('signs up when submitting in sign-up mode', async () => {
    const w = await mountSuspended(LoginPage)
    const toggle = w.findAll('button').find(b => b.text().includes('Create an account'))
    await toggle?.trigger('click')
    await w.find('input[type="email"]').setValue('new@b.com')
    await w.find('input[type="password"]').setValue('secret12')
    await w.find('form').trigger('submit')
    await flushPromises()
    expect(calls).toContain('signup:new@b.com')
  })

  it('sends a reset link from the forgot-password action', async () => {
    const w = await mountSuspended(LoginPage)
    await w.find('input[type="email"]').setValue('a@b.com')
    const forgot = w.findAll('button').find(b => b.text().includes('Forgot password'))
    await forgot?.trigger('click')
    await flushPromises()
    expect(calls).toContain('reset:a@b.com')
  })
})
