// @vitest-environment nuxt
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import RsvpPage from '../app/pages/rsvp.vue'
import { fakeApi } from './utils/fakeApi'

const api = fakeApi(['/api/rsvp'], () => ({ ok: true, status: 'going' }))

mockNuxtImport('useRoute', () => () => ({ query: { token: 'abc', status: 'going' } }))

beforeEach(() => api.reset())

describe('rsvp page', () => {
  it('records the RSVP from the email link on mount and confirms', async () => {
    const w = await mountSuspended(RsvpPage)
    // The faked route answers asynchronously; wait for the confirmation to render.
    await vi.waitFor(() => expect(w.text()).toContain('You\'re going'))
    expect(api.calls[0]).toMatchObject({ url: '/api/rsvp', method: 'POST', body: { token: 'abc', status: 'going' } })
  })
})
