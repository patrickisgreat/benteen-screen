// @vitest-environment nuxt
import { beforeEach, describe, expect, it } from 'vitest'
import { ref } from 'vue'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'

interface Call { fn: string, args: unknown[] }
const calls: Call[] = []
let nextError: Error | null = null
let nextSession: unknown = null // what signUp returns as data.session

const auth = {
  signInWithOAuth: (args: unknown) => { calls.push({ fn: 'signInWithOAuth', args: [args] }); return Promise.resolve({ error: nextError }) },
  signInWithPassword: (args: unknown) => { calls.push({ fn: 'signInWithPassword', args: [args] }); return Promise.resolve({ error: nextError }) },
  signUp: (args: unknown) => { calls.push({ fn: 'signUp', args: [args] }); return Promise.resolve({ data: { session: nextSession }, error: nextError }) },
  resetPasswordForEmail: (email: string, opts: unknown) => { calls.push({ fn: 'resetPasswordForEmail', args: [email, opts] }); return Promise.resolve({ error: nextError }) },
  signOut: () => { calls.push({ fn: 'signOut', args: [] }); return Promise.resolve({ error: null }) }
}

mockNuxtImport('useSupabaseClient', () => () => ({ auth }))
mockNuxtImport('useSupabaseUser', () => () => ref(null))

beforeEach(() => {
  calls.length = 0
  nextError = null
  nextSession = null
})

describe('useAuth providers', () => {
  it('signInWithGoogle uses the google provider and the /confirm callback', async () => {
    await useAuth().signInWithGoogle()
    const c = calls[0]
    expect(c.fn).toBe('signInWithOAuth')
    const arg = c.args[0] as { provider: string, options: { redirectTo: string } }
    expect(arg.provider).toBe('google')
    expect(arg.options.redirectTo).toContain('/confirm')
  })

  it('signInWithFacebook uses the facebook provider', async () => {
    await useAuth().signInWithFacebook()
    expect((calls[0].args[0] as { provider: string }).provider).toBe('facebook')
  })

  it('signInWithEmail calls signInWithPassword with the credentials', async () => {
    await useAuth().signInWithEmail('a@b.com', 'pw')
    expect(calls[0]).toMatchObject({ fn: 'signInWithPassword', args: [{ email: 'a@b.com', password: 'pw' }] })
  })

  it('signUpWithEmail calls signUp with an email confirmation redirect', async () => {
    await useAuth().signUpWithEmail('a@b.com', 'pw12345678')
    const arg = calls[0].args[0] as { email: string, options: { emailRedirectTo: string } }
    expect(calls[0].fn).toBe('signUp')
    expect(arg.email).toBe('a@b.com')
    expect(arg.options.emailRedirectTo).toContain('/confirm')
  })

  it('signUpWithEmail reports needsConfirmation when no session comes back', async () => {
    nextSession = null
    const res = await useAuth().signUpWithEmail('a@b.com', 'pw12345678')
    expect(res.needsConfirmation).toBe(true)
  })

  it('signUpWithEmail reports no confirmation needed when a session is returned', async () => {
    nextSession = { access_token: 'x' }
    const res = await useAuth().signUpWithEmail('a@b.com', 'pw12345678')
    expect(res.needsConfirmation).toBe(false)
  })

  it('sendPasswordReset sends the recovery link to /reset-password', async () => {
    await useAuth().sendPasswordReset('a@b.com')
    expect(calls[0].fn).toBe('resetPasswordForEmail')
    expect(calls[0].args[0]).toBe('a@b.com')
    expect((calls[0].args[1] as { redirectTo: string }).redirectTo).toContain('/reset-password')
  })

  it('surfaces supabase auth errors by throwing', async () => {
    nextError = new Error('Invalid login credentials')
    await expect(useAuth().signInWithEmail('a@b.com', 'pw')).rejects.toThrow('Invalid login credentials')
  })
})
