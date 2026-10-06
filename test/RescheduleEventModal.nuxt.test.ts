// @vitest-environment nuxt
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { computed } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import RescheduleEventModal from '../app/components/RescheduleEventModal.vue'
import type { RescheduleAudience, RescheduleRequest } from '../shared/utils/reschedule'

interface Toast { title?: string, description?: string, color?: string }
interface Result { sent: number, failed: number, error: string | null }

const audienceFn = vi.fn<(id: string) => Promise<RescheduleAudience>>()
const rescheduleFn = vi.fn<(id: string, request: RescheduleRequest) => Promise<Result>>()
const toasts: Toast[] = []

mockNuxtImport('useEventAdmin', () => () => ({ rescheduleAudience: audienceFn, rescheduleEvent: rescheduleFn }))
mockNuxtImport('useAuth', () => () => ({ account: computed(() => ({ displayName: 'Pat Host' })) }))
mockNuxtImport('useToast', () => () => ({ add: (t: Toast) => toasts.push(t) }))

// A far-future event so the date input's "not before today" minimum never bites.
const event = {
  id: 'e1', title: 'Jaws on the Green', description: '', event_date: new Date('2999-10-17T00:00:00').toISOString(), start_time: '8pm',
  location: null, location_url: null, poster_url: null, voting_locked_at: null, invite_options: null, poster_display: null,
  reminders_enabled: true, previous_event_date: null, previous_start_time: null, rescheduled_at: null, created_at: ''
}
const audience: RescheduleAudience = { total: 28, going: 5, maybe: 1, declined: 2, noReply: 20, sample: { name: 'Sam Jones', rsvp: 'going' } }

// UModal teleports to <body>; find controls there.
const body = (): string => document.body.textContent ?? ''
const button = (text: string): HTMLButtonElement | undefined => [...document.querySelectorAll('button')].find(b => b.textContent?.includes(text))
const dateInput = (): HTMLInputElement => document.querySelector<HTMLInputElement>('input[type="date"]')!

async function setValue(el: HTMLInputElement | HTMLTextAreaElement, value: string): Promise<void> {
  el.value = value
  el.dispatchEvent(new Event('input', { bubbles: true }))
  await flushPromises()
}

async function openModal() {
  const w = await mountSuspended(RescheduleEventModal, { props: { open: false, event, previewDebounceMs: 0 } })
  await w.setProps({ open: true })
  await flushPromises()
  return w
}

beforeEach(() => {
  document.body.innerHTML = ''
  toasts.length = 0
  audienceFn.mockReset()
  audienceFn.mockResolvedValue(audience)
  rescheduleFn.mockReset()
  rescheduleFn.mockResolvedValue({ sent: 28, failed: 0, error: null })
})

describe('RescheduleEventModal', () => {
  it('opens on the current date and says exactly who will be emailed', async () => {
    await openModal()
    expect(dateInput().value).toBe('2999-10-17')
    expect(audienceFn).toHaveBeenCalledWith('e1')
    expect(body()).toContain('28 people will be emailed: 5 going, 1 maybe, 2 who declined, 20 who haven\'t replied.')
    expect(body()).toContain('RSVPs stay as they are')
  })

  it('cannot be confirmed until the date or time actually changes', async () => {
    await openModal()
    expect(button('Pick a new date')?.disabled).toBe(true)
    await setValue(dateInput(), '2999-10-18')
    expect(button('Move it and email 28')?.disabled).toBe(false)
  })

  it('previews the email a real guest will get: old and new date, their name, their RSVP', async () => {
    await openModal()
    await setValue(dateInput(), '2999-10-18')
    const preview = (): string => document.querySelector('[data-testid="date-change-preview"] iframe')?.getAttribute('srcdoc') ?? ''
    await vi.waitFor(() => expect(preview()).toContain('October 18, 2999'))
    expect(preview()).toContain('line-through')
    expect(preview()).toContain('Hi Sam, Pat Host had to move movie night.')
    expect(preview()).toContain('still on the list as going')
    expect(body()).toContain('Subject: New date: Jaws on the Green is now')
  })

  it('moves the event with the note and reports how many were emailed', async () => {
    const w = await openModal()
    await setValue(dateInput(), '2999-10-18')
    await setValue(document.querySelector('textarea')!, 'Rain on Friday.')
    button('Move it and email 28')!.click()
    await flushPromises()
    expect(rescheduleFn).toHaveBeenCalledWith('e1', {
      eventDate: new Date('2999-10-18T00:00:00').toISOString(),
      startTime: '8pm',
      note: 'Rain on Friday.',
      notify: true
    })
    expect(toasts.at(-1)).toMatchObject({ description: '28 people emailed.', color: 'success' })
    expect(w.emitted('moved')).toHaveLength(1)
    expect(w.emitted('update:open')?.at(-1)).toEqual([false])
  })

  it('can move the date quietly, with no email and no preview', async () => {
    await openModal()
    await setValue(dateInput(), '2999-10-18')
    document.querySelector<HTMLButtonElement>('button[role="switch"]')!.click()
    await flushPromises()
    expect(document.querySelector('[data-testid="date-change-preview"]')).toBeNull()
    expect(body()).toContain('Nobody is told')
    button('Move it without emailing')!.click()
    await flushPromises()
    expect(rescheduleFn.mock.calls[0]![1]).toMatchObject({ notify: false })
  })

  it('offers a silent move when there is no one to email yet', async () => {
    audienceFn.mockResolvedValue({ total: 0, going: 0, maybe: 0, declined: 0, noReply: 0, sample: null })
    await openModal()
    await setValue(dateInput(), '2999-10-18')
    expect(body()).toContain('there is no one to email')
    expect(button('Move it without emailing')).toBeDefined()
  })

  it('says plainly when the date moved but the email failed', async () => {
    rescheduleFn.mockResolvedValue({ sent: 0, failed: 28, error: 'Unverified domain' })
    await openModal()
    await setValue(dateInput(), '2999-10-18')
    button('Move it and email 28')!.click()
    await flushPromises()
    expect(toasts.at(-1)).toMatchObject({ title: 'The date moved, but the email could not be sent', color: 'error' })
    expect(toasts.at(-1)?.description).toContain('Unverified domain')
  })

  it('stays open and reports the reason when the move itself is rejected', async () => {
    rescheduleFn.mockRejectedValue(new Error('Admins only'))
    const w = await openModal()
    await setValue(dateInput(), '2999-10-18')
    button('Move it and email 28')!.click()
    await flushPromises()
    expect(toasts.at(-1)).toMatchObject({ title: 'Could not move the event', color: 'error' })
    expect(w.emitted('moved')).toBeUndefined()
  })
})
