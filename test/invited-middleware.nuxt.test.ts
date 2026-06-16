// @vitest-environment nuxt
import { beforeEach, describe, expect, it } from 'vitest'
import { ref } from 'vue'
import type { RouteLocationNormalized } from 'vue-router'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import middleware from '../app/middleware/invited.global'

// Module-scope test state the mocks read at call time (same pattern as
// useAdminPeople.nuxt.test.ts referencing top-level vars).
const state = {
  user: ref<{ id: string } | null>(null),
  rpcData: true as boolean | null,
  rpcError: null as { message: string } | null,
  signOutCalls: 0,
  navigatedTo: null as string | null
}

mockNuxtImport('useSupabaseUser', () => () => state.user)
mockNuxtImport('useSupabaseClient', () => () => ({
  rpc: async () => ({ data: state.rpcData, error: state.rpcError }),
  auth: { signOut: async () => { state.signOutCalls++ } }
}))
mockNuxtImport('navigateTo', () => (to: string) => {
  state.navigatedTo = to
  return to
})

const route = (path: string) => ({ path }) as unknown as RouteLocationNormalized
const run = (path: string) => middleware(route(path), route('/'))

beforeEach(() => {
  state.user.value = null
  state.rpcData = true
  state.rpcError = null
  state.signOutCalls = 0
  state.navigatedTo = null
  useState<boolean | null>('is-allowed', () => null).value = null
})

describe('invited.global middleware', () => {
  it('lets public paths through without checking access', async () => {
    state.user.value = { id: 'u1' }
    for (const p of ['/', '/about', '/login', '/confirm', '/request-access']) {
      await run(p)
    }
    expect(state.signOutCalls).toBe(0)
    expect(state.navigatedTo).toBeNull()
  })

  it('ignores unauthenticated users (the Supabase module redirects them)', async () => {
    state.user.value = null
    await run('/overview')
    expect(state.signOutCalls).toBe(0)
    expect(state.navigatedTo).toBeNull()
  })

  it('lets allowlisted users reach a gated route', async () => {
    state.user.value = { id: 'u1' }
    state.rpcData = true
    const result = await run('/overview')
    expect(result).toBeUndefined()
    expect(state.signOutCalls).toBe(0)
    expect(state.navigatedTo).toBeNull()
  })

  it('signs out and redirects users who are not on the allowlist', async () => {
    state.user.value = { id: 'u1' }
    state.rpcData = false
    await run('/overview')
    expect(state.signOutCalls).toBe(1)
    expect(state.navigatedTo).toBe('/request-access')
  })

  it('clears the cached verdict on deny so a later sign-in is re-checked', async () => {
    state.user.value = { id: 'u1' }
    state.rpcData = false
    await run('/overview')
    expect(useState('is-allowed').value).toBeNull()
  })

  it('fails OPEN on an RPC error (UX gate must not lock everyone out; RLS still enforces)', async () => {
    state.user.value = { id: 'u1' }
    state.rpcData = null
    state.rpcError = { message: 'function is_allowed does not exist' }
    await run('/overview')
    // No sign-out, no redirect — the user proceeds; RLS governs their data.
    expect(state.signOutCalls).toBe(0)
    expect(state.navigatedTo).toBeNull()
    // And the verdict isn't cached, so a later (recovered) navigation re-checks.
    expect(useState('is-allowed').value).toBeNull()
  })

  it('caches the verdict so a second navigation skips the RPC', async () => {
    state.user.value = { id: 'u1' }
    state.rpcData = true
    await run('/overview')
    // Even if the RPC would now deny, the cached "allowed" wins this session.
    state.rpcData = false
    await run('/profile')
    expect(state.signOutCalls).toBe(0)
    expect(state.navigatedTo).toBeNull()
  })
})
