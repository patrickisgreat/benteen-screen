// @vitest-environment nuxt
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import InviteToEventModal from '../app/components/InviteToEventModal.vue'
import type { MovieEvent } from '../shared/types/event'

interface Toast { title?: string, color?: string }
const toasts: Toast[] = []
const inviteFn = vi.fn(async (_eventId: string, _guest: unknown, _sendNow: boolean) => ({ added: true, sent: 1, failed: 0, error: null }))
mockNuxtImport('useInviteToEvent', () => () => ({ inviteToEvent: inviteFn }))
mockNuxtImport('useToast', () => () => ({ add: (t: Toast) => toasts.push(t) }))

const events = [
  { id: 'soon', title: 'Jaws', event_date: '2030-07-01T00:00:00Z' },
  { id: 'later', title: 'Alien', event_date: '2030-08-01T00:00:00Z' }
] as MovieEvent[]
const guest = { email: 'ada@x.com', display_name: 'Ada' }

// UModal teleports to <body>; find the confirm button there.
function buttonNamed(text: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll('button')].find(b => b.textContent?.includes(text))
}

beforeEach(() => {
  toasts.length = 0
  inviteFn.mockClear()
  inviteFn.mockResolvedValue({ added: true, sent: 1, failed: 0, error: null })
  document.body.innerHTML = ''
})

describe('InviteToEventModal', () => {
  it('defaults to the soonest event and sends the e-vite on confirm', async () => {
    await mountSuspended(InviteToEventModal, { props: { open: true, guest, events } })
    await flushPromises()
    expect(document.body.textContent).toContain('Invite Ada to an event')
    buttonNamed('Send e-vite')!.click()
    await flushPromises()
    expect(inviteFn).toHaveBeenCalledWith('soon', guest, true)
    expect(toasts.at(-1)).toMatchObject({ title: 'E-vite sent to Ada', color: 'success' })
  })

  it('says so when they were already on that list and nothing was sent', async () => {
    inviteFn.mockResolvedValueOnce({ added: false, sent: 0, failed: 0, error: null })
    await mountSuspended(InviteToEventModal, { props: { open: true, guest, events } })
    await flushPromises()
    buttonNamed('Send e-vite')!.click()
    await flushPromises()
    expect(toasts.at(-1)).toMatchObject({ title: 'Ada is already on that guest list' })
  })

  it('surfaces a failed send instead of a fake success', async () => {
    inviteFn.mockResolvedValueOnce({ added: true, sent: 0, failed: 1, error: 'Domain not verified' })
    await mountSuspended(InviteToEventModal, { props: { open: true, guest, events } })
    await flushPromises()
    buttonNamed('Send e-vite')!.click()
    await flushPromises()
    expect(toasts.at(-1)).toMatchObject({ color: 'error', description: 'Domain not verified' })
  })

  it('offers nothing to confirm when there is no upcoming event', async () => {
    await mountSuspended(InviteToEventModal, { props: { open: true, guest, events: [] } })
    await flushPromises()
    expect(document.body.textContent).toContain('No upcoming movie night')
    expect(buttonNamed('Send e-vite')!.disabled).toBe(true)
  })
})
