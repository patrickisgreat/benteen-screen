// @vitest-environment nuxt
import { beforeEach, describe, expect, it } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import GuestTextModal from '../app/components/GuestTextModal.vue'
import type { EventInvite } from '../shared/types/event-invite'

const sam: EventInvite = {
  id: 'b', event_id: 'e', email: 'sam@x.com', display_name: 'Sam Beam', token: 'tok', rsvp: null, rsvp_at: null, plus_ones: 0,
  invited_by: null, resend_id: null, sent_at: 't', delivered_at: null, opened_at: null, clicked_at: null, bounced_at: null,
  reminded_at: null, phone: null, texted_at: null, created_at: ''
}
const defaultMessage = 'Hey Sam! Movie night Fri. RSVP: https://x.y/rsvp?token=tok'

// The modal teleports to <body>.
const body = {
  input: (label: string): HTMLInputElement | HTMLTextAreaElement => document.querySelector(`[aria-label="${label}"]`)!,
  button: (text: string): HTMLButtonElement | HTMLAnchorElement | undefined =>
    [...document.querySelectorAll<HTMLButtonElement | HTMLAnchorElement>('button, a')].find(b => b.textContent?.includes(text))
}

async function type(el: HTMLInputElement | HTMLTextAreaElement, value: string): Promise<void> {
  el.value = value
  el.dispatchEvent(new Event('input', { bubbles: true }))
  await flushPromises()
}

async function mount(invite: EventInvite = sam) {
  const w = await mountSuspended(GuestTextModal, { props: { open: true, invite, defaultMessage } })
  await flushPromises()
  return w
}

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('GuestTextModal', () => {
  it('names the guest and pre-fills the message from the event template', async () => {
    await mount()
    expect(document.body.textContent).toContain('Text Sam Beam')
    expect(body.input('Text message').value).toBe(defaultMessage)
  })

  it('cannot open Messages until the guest has a dialable number', async () => {
    await mount()
    const open = body.button('Open in Messages')!
    expect(open.hasAttribute('disabled') || open.getAttribute('aria-disabled') === 'true').toBe(true)
    expect(open.getAttribute('href')).toBeNull()
  })

  it('links to an sms: URL for the guest with the (edited) message, and reports the text', async () => {
    const w = await mount({ ...sam, phone: '+15551234567' })
    expect(body.input('Mobile number').value).toBe('(555) 123-4567')
    await type(body.input('Text message'), 'Sam! Bring the good chairs.')
    const open = body.button('Open in Messages')!
    expect(open.getAttribute('href')).toBe('sms:+15551234567?&body=Sam!%20Bring%20the%20good%20chairs.')
    open.click()
    await flushPromises()
    expect(w.emitted('text')?.[0]).toEqual(['+15551234567', 'Sam! Bring the good chairs.'])
  })

  it('saves a newly typed number in E.164', async () => {
    const w = await mount()
    await type(body.input('Mobile number'), '555-123-4567')
    body.button('Save')!.click()
    await flushPromises()
    expect(w.emitted('savePhone')?.[0]).toEqual(['+15551234567'])
  })

  it('flags a number that cannot be dialed and will not save or text it', async () => {
    const w = await mount()
    await type(body.input('Mobile number'), '555-12')
    expect(document.body.textContent).toContain('Not a valid number')
    body.button('Save')!.click()
    await flushPromises()
    expect(w.emitted('savePhone')).toBeUndefined()
    expect(body.button('Open in Messages')!.getAttribute('href')).toBeNull()
  })

  it('texting with a number typed but not yet saved hands that number back to be saved', async () => {
    const w = await mount()
    await type(body.input('Mobile number'), '(555) 765-4321')
    body.button('Open in Messages')!.click()
    await flushPromises()
    expect(w.emitted('text')?.[0]).toEqual(['+15557654321', defaultMessage])
  })

  it('shows when the guest was last texted', async () => {
    await mount({ ...sam, phone: '+15551234567', texted_at: '2026-10-10T18:00:00Z' })
    expect(document.body.textContent).toContain('Last texted')
  })
})
