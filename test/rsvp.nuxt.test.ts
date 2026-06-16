// @vitest-environment nuxt
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import RsvpPage from '../app/pages/rsvp.vue'

const calls: Array<{ url: string, body: unknown }> = []

mockNuxtImport('useRoute', () => () => ({ query: { token: 'abc', status: 'going' } }))

beforeEach(() => {
  calls.length = 0
  vi.stubGlobal('$fetch', (url: string, opts: { body: unknown }) => {
    calls.push({ url, body: opts.body })
    return Promise.resolve({ ok: true, status: 'going' })
  })
})
afterEach(() => vi.unstubAllGlobals())

describe('rsvp page', () => {
  it('records the RSVP from the email link on mount and confirms', async () => {
    const w = await mountSuspended(RsvpPage)
    await flushPromises()
    expect(calls[0]).toMatchObject({ url: '/api/rsvp', body: { token: 'abc', status: 'going' } })
    expect(w.text()).toContain("You're going")
  })
})
