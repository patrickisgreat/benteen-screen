// @vitest-environment nuxt
import { beforeEach, describe, expect, it } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import GuestRsvpModal from '../app/components/GuestRsvpModal.vue'
import type { EventInvite } from '../shared/types/event-invite'

const base: EventInvite = {
  id: 'inv-1', event_id: 'e', email: 'ada@x.com', display_name: 'Ada', token: 't',
  rsvp: null, rsvp_at: null, plus_ones: 0, invited_by: null, resend_id: null, sent_at: null,
  delivered_at: null, opened_at: null, clicked_at: null, bounced_at: null, reminded_at: null, created_at: ''
}
const counts = { going: 4, maybe: 1, no: 0, guests: 2 }

// UModal teleports to <body>; find controls there.
function buttonNamed(text: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll('button')].find(b => b.textContent?.includes(text))
}
function byLabel(label: string): HTMLButtonElement | null {
  return document.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)
}

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('GuestRsvpModal', () => {
  it('is titled for the guest and shows the event headcount', async () => {
    await mountSuspended(GuestRsvpModal, { props: { open: true, invite: base, counts } })
    await flushPromises()
    expect(document.body.textContent).toContain('RSVP for Ada')
    expect(document.body.textContent).toContain('ada@x.com')
    expect(document.body.textContent).toContain('4 going')
  })

  it('emits the chosen status when the guest has not replied yet', async () => {
    const w = await mountSuspended(GuestRsvpModal, { props: { open: true, invite: base, counts } })
    await flushPromises()
    buttonNamed('Maybe')!.click()
    await flushPromises()
    expect(w.emitted('set')?.[0]).toEqual(['maybe', 0])
  })

  it('clears the reply when the highlighted answer is tapped again', async () => {
    const w = await mountSuspended(GuestRsvpModal, { props: { open: true, invite: { ...base, rsvp: 'going', plus_ones: 2 }, counts } })
    await flushPromises()
    buttonNamed('Going')!.click()
    await flushPromises()
    expect(w.emitted('set')?.[0]).toEqual([null, 0])
  })

  it('drops the guest count when moving them off going', async () => {
    const w = await mountSuspended(GuestRsvpModal, { props: { open: true, invite: { ...base, rsvp: 'going', plus_ones: 2 }, counts } })
    await flushPromises()
    buttonNamed('Can\'t')!.click()
    await flushPromises()
    expect(w.emitted('set')?.[0]).toEqual(['no', 0])
  })

  it('shows the guest stepper only while going and emits the new +1 count', async () => {
    await mountSuspended(GuestRsvpModal, { props: { open: true, invite: { ...base, rsvp: 'maybe' }, counts } })
    await flushPromises()
    expect(byLabel('One more guest')).toBeNull()
    document.body.innerHTML = ''

    const w = await mountSuspended(GuestRsvpModal, { props: { open: true, invite: { ...base, rsvp: 'going', plus_ones: 1 }, counts } })
    await flushPromises()
    expect(document.body.textContent).toContain('+1 guest')
    byLabel('One more guest')!.click()
    await flushPromises()
    expect(w.emitted('set')?.[0]).toEqual(['going', 2])
  })

  it('closes on Done', async () => {
    const w = await mountSuspended(GuestRsvpModal, { props: { open: true, invite: base, counts } })
    await flushPromises()
    buttonNamed('Done')!.click()
    await flushPromises()
    expect(w.emitted('update:open')?.at(-1)).toEqual([false])
  })
})
