// @vitest-environment nuxt
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createError } from 'h3'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import PollPage from '../app/pages/poll.vue'
import { fakeApi } from './utils/fakeApi'

const options = [{ id: 'yes', label: 'Yes, Saturday' }, { id: 'no', label: 'Keep Friday' }]
let respond: (body: { optionId: string }) => unknown

const api = fakeApi(['/api/poll-vote'], call => respond(call.body as { optionId: string }))

let query: Record<string, string> = {}
mockNuxtImport('useRoute', () => () => ({ query }))

beforeEach(() => {
  api.reset()
  query = { token: 'abc12345', poll: 'p1', option: 'yes' }
  respond = body => ({ ok: true, question: 'Move to Saturday?', options, chosen: body.optionId, closed: false })
})

describe('poll page', () => {
  it('casts the vote from the email link on mount and confirms the answer', async () => {
    const w = await mountSuspended(PollPage)
    await vi.waitFor(() => expect(w.text()).toContain('Got it: Yes, Saturday'))
    expect(api.calls[0]).toMatchObject({ url: '/api/poll-vote', method: 'POST', body: { token: 'abc12345', pollId: 'p1', optionId: 'yes' } })
    expect(w.text()).toContain('Move to Saturday?')
  })

  it('lets them change their answer', async () => {
    const w = await mountSuspended(PollPage)
    await vi.waitFor(() => expect(w.text()).toContain('Got it: Yes, Saturday'))
    await w.findAll('button').find(b => b.text() === 'Keep Friday')!.trigger('click')
    await vi.waitFor(() => expect(w.text()).toContain('Got it: Keep Friday'))
    expect(api.calls.at(-1)).toMatchObject({ body: { optionId: 'no' } })
  })

  it('tells them when the poll has closed, with the answer they had given', async () => {
    respond = () => ({ ok: true, question: 'Move to Saturday?', options, chosen: 'no', closed: true })
    const w = await mountSuspended(PollPage)
    await vi.waitFor(() => expect(w.text()).toContain('This poll has closed'))
    expect(w.text()).toContain('Your answer was “Keep Friday”')
    expect(w.findAll('button')).toHaveLength(0)
  })

  it('shows an error when the vote is rejected', async () => {
    respond = () => {
      throw createError({ statusCode: 404, statusMessage: 'Poll not found' })
    }
    const w = await mountSuspended(PollPage)
    await vi.waitFor(() => expect(w.text()).toContain('We couldn\'t record that'))
  })

  it('does not call the server for a link missing its token, poll or option', async () => {
    query = { token: 'abc12345', poll: 'p1' }
    const w = await mountSuspended(PollPage)
    await vi.waitFor(() => expect(w.text()).toContain('We couldn\'t record that'))
    expect(api.calls).toHaveLength(0)
  })
})
