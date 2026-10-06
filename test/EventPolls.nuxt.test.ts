// @vitest-environment nuxt
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import EventPolls from '../app/components/EventPolls.vue'
import type { PollRequest, PollResults } from '../shared/utils/poll'

interface Toast { title?: string, description?: string, color?: string }
interface SendResult { sent: number, failed: number, error: string | null }

const polls = ref<PollResults[]>([])
const sendFn = vi.fn<(poll: PollRequest) => Promise<SendResult>>()
const closeFn = vi.fn(async (_id: string) => {})
const removeFn = vi.fn(async (_id: string) => {})
const toasts: Toast[] = []

mockNuxtImport('usePolls', () => () => ({ polls, error: ref(null), sendPoll: sendFn, closePoll: closeFn, removePoll: removeFn }))
mockNuxtImport('useToast', () => () => ({ add: (t: Toast) => toasts.push(t) }))

const poll = (over: Partial<PollResults> = {}): PollResults => ({
  id: 'p1',
  question: 'Move to Saturday?',
  closedAt: null,
  createdAt: '2026-10-04T00:00:00Z',
  totalVotes: 3,
  options: [
    { id: 'yes', label: 'Yes, Saturday', votes: 2, voters: ['Ada', 'Bo'] },
    { id: 'no', label: 'Keep Friday', votes: 1, voters: ['Cy'] }
  ],
  ...over
})

type Wrapper = Awaited<ReturnType<typeof mountSuspended>>
const mount = (): Promise<Wrapper> => mountSuspended(EventPolls, { props: { eventId: 'e1' } })
const sendButton = (w: Wrapper) => w.findAll('button').find(b => b.text().includes('Send poll'))!

async function fill(w: Wrapper, question: string, choices: string[]): Promise<void> {
  const inputs = w.findAll('input')
  await inputs[0]!.setValue(question)
  for (const [i, choice] of choices.entries()) await inputs[i + 1]!.setValue(choice)
}

beforeEach(() => {
  polls.value = []
  toasts.length = 0
  sendFn.mockReset()
  sendFn.mockResolvedValue({ sent: 3, failed: 0, error: null })
  closeFn.mockClear()
  removeFn.mockClear()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('EventPolls', () => {
  it('cannot send until there is a question and two different choices', async () => {
    const w = await mount()
    expect(sendButton(w).attributes('disabled')).toBeDefined()
    await fill(w, 'Move to Saturday?', ['Yes', 'yes'])
    expect(sendButton(w).attributes('disabled')).toBeDefined()
    await fill(w, 'Move to Saturday?', ['Yes', 'No'])
    expect(sendButton(w).attributes('disabled')).toBeUndefined()
  })

  it('sends the poll and confirms how many guests it reached, then clears the draft', async () => {
    const w = await mount()
    await fill(w, 'Move to Saturday?', ['Yes', 'No'])
    await w.find('form').trigger('submit')
    await flushPromises()
    expect(sendFn).toHaveBeenCalledWith({ question: 'Move to Saturday?', options: ['Yes', 'No'], note: null })
    expect(toasts.at(-1)).toMatchObject({ title: 'Poll sent to 3 guests', color: 'success' })
    expect((w.findAll('input')[0]!.element as HTMLInputElement).value).toBe('')
  })

  it('reports a partial send with the reason', async () => {
    sendFn.mockResolvedValueOnce({ sent: 2, failed: 1, error: 'Rate limited' })
    const w = await mount()
    await fill(w, 'Q', ['a', 'b'])
    await w.find('form').trigger('submit')
    await flushPromises()
    expect(toasts.at(-1)).toMatchObject({ title: 'Poll sent to 2, 1 failed', description: 'Rate limited', color: 'warning' })
  })

  it('says the poll was not emailed when nothing went out, and keeps the draft', async () => {
    sendFn.mockResolvedValueOnce({ sent: 0, failed: 3, error: 'Unverified domain' })
    const w = await mount()
    await fill(w, 'Q', ['a', 'b'])
    await w.find('form').trigger('submit')
    await flushPromises()
    expect(toasts.at(-1)).toMatchObject({ title: 'The poll was created but could not be emailed', description: 'Unverified domain', color: 'error' })
    expect((w.findAll('input')[0]!.element as HTMLInputElement).value).toBe('Q')
  })

  it('surfaces a rejected request (e.g. nobody e-vited yet)', async () => {
    sendFn.mockRejectedValueOnce(new Error('No one has been e-vited to this event yet'))
    const w = await mount()
    await fill(w, 'Q', ['a', 'b'])
    await w.find('form').trigger('submit')
    await flushPromises()
    expect(toasts.at(-1)).toMatchObject({ title: 'Could not send the poll', color: 'error' })
  })

  it('adds choices up to the limit and removes them down to two', async () => {
    const w = await mount()
    const add = () => w.findAll('button').find(b => b.text().includes('Add a choice'))
    for (let i = 0; i < 4; i++) await add()!.trigger('click')
    expect(w.findAll('input')).toHaveLength(7) // question + 6 choices
    expect(add()).toBeUndefined()
    await w.find('button[aria-label="Remove choice 6"]').trigger('click')
    expect(w.findAll('input')).toHaveLength(6)
  })

  it('shows each poll\'s results: counts and who picked what', async () => {
    polls.value = [poll()]
    const w = await mount()
    const card = w.get('[data-testid="poll"]').text()
    expect(card).toContain('Move to Saturday?')
    expect(card).toContain('3 answers')
    expect(card).toContain('Yes, Saturday')
    expect(card).toContain('Ada, Bo')
    expect(card).toContain('Keep Friday')
    expect(card).toContain('Cy')
  })

  it('closes an open poll, and shows a closed one as closed', async () => {
    polls.value = [poll()]
    const w = await mount()
    await w.findAll('button').find(b => b.text() === 'Close')!.trigger('click')
    await flushPromises()
    expect(closeFn).toHaveBeenCalledWith('p1')

    polls.value = [poll({ closedAt: '2026-10-05T00:00:00Z' })]
    const closed = await mount()
    expect(closed.get('[data-testid="poll"]').text()).toContain('Closed')
    expect(closed.findAll('button').find(b => b.text() === 'Close')).toBeUndefined()
  })

  it('deletes a poll', async () => {
    polls.value = [poll()]
    const w = await mount()
    await w.find('button[aria-label="Delete poll"]').trigger('click')
    await flushPromises()
    expect(removeFn).toHaveBeenCalledWith('p1')
  })
})
