// @vitest-environment nuxt
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import RsvpPage from '../app/pages/rsvp.vue'
import { fakeApi } from './utils/fakeApi'

const api = fakeApi(['/api/rsvp'], () => ({ ok: true, status: 'going', plusOnes: 2 }))

mockNuxtImport('useRoute', () => () => ({ query: { token: 'abc', status: 'going' } }))

beforeEach(() => api.reset())

describe('rsvp page', () => {
  it('records the RSVP from the email link on mount and confirms', async () => {
    const w = await mountSuspended(RsvpPage)
    // The faked route answers asynchronously; wait for the confirmation to render.
    await vi.waitFor(() => expect(w.text()).toContain('You\'re going'))
    expect(api.calls[0]).toMatchObject({ url: '/api/rsvp', method: 'POST', body: { token: 'abc', status: 'going' } })
  })

  it('does not state a guest count from the email link, and shows the one the server kept', async () => {
    const w = await mountSuspended(RsvpPage)
    await vi.waitFor(() => expect(w.text()).toContain('You\'re going'))
    // No plusOnes in the body: the server keeps the +1s they already had.
    expect(api.calls[0]!.body).not.toHaveProperty('plusOnes')
    expect(w.text()).toContain('+2 guests')
  })
})
