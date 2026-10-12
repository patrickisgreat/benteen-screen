// @vitest-environment nuxt
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, ref } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import EventInviteManager from '../app/components/EventInviteManager.vue'

interface SendResult { sent: number, failed: number, error: string | null }
interface Toast { title?: string, description?: string, color?: string }

const invites = ref([
  { id: 'a', event_id: 'e', email: 'pat@x.com', display_name: 'Pat', token: '1', rsvp: 'going', rsvp_at: null, plus_ones: 0, invited_by: null, resend_id: null, sent_at: 't', delivered_at: null, opened_at: null, clicked_at: null, bounced_at: null, reminded_at: null, phone: '+15551230001', texted_at: null, created_at: '' },
  { id: 'b', event_id: 'e', email: 'sam@x.com', display_name: 'Sam', token: '2', rsvp: null, rsvp_at: null, plus_ones: 0, invited_by: null, resend_id: null, sent_at: null, delivered_at: null, opened_at: null, clicked_at: null, bounced_at: null, reminded_at: null, phone: null, texted_at: null, created_at: '' }
])
const sendFn = vi.fn<() => Promise<SendResult>>(async () => ({ sent: 0, failed: 0, error: null }))
const remindFn = vi.fn<() => Promise<SendResult>>(async () => ({ sent: 0, failed: 0, error: null }))
const removeMany = vi.fn(async () => {})
const seedFn = vi.fn(async () => 0)
const addFn = vi.fn(async (_email: string, _name?: string) => {})
const saveOptionsFn = vi.fn(async () => {})
const setRsvpFn = vi.fn(async (_inviteId: string, _status: string | null, _plusOnes: number) => {})
const notifyRsvpFn = vi.fn<(inviteId: string) => Promise<SendResult>>(async () => ({ sent: 1, failed: 0, error: null }))
const setPhoneFn = vi.fn(async (_inviteId: string, _phone: string | null) => {})
const markTextedFn = vi.fn(async (_inviteIds: readonly string[]) => {})
const toasts: Toast[] = []

const eventObj = {
  id: 'e',
  title: 'The Goonies',
  description: '<p>Bring snacks</p>',
  event_date: '2026-07-01T00:00:00Z',
  start_time: '8pm',
  location: 'The Green',
  location_url: null,
  poster_url: 'https://img/goonies.jpg',
  voting_locked_at: null,
  invite_options: null,
  created_at: ''
}

mockNuxtImport('useEventInvites', () => () => ({
  invites,
  pending: ref(false),
  stats: computed(() => ({ invited: 2, sent: 1, opened: 0, clicked: 0, going: 1, maybe: 0, no: 0, noReply: 1 })),
  refresh: async () => {},
  addInvite: addFn,
  removeInvite: async () => {},
  removeInvites: removeMany,
  seedFromLastEvent: seedFn,
  sendInvites: sendFn,
  remindNonResponders: remindFn,
  setRsvp: setRsvpFn,
  notifyRsvp: notifyRsvpFn,
  setPhone: setPhoneFn,
  markTexted: markTextedFn
}))
mockNuxtImport('useToast', () => () => ({ add: (t: Toast) => toasts.push(t) }))
mockNuxtImport('useGuestDirectory', () => () => ({
  candidates: ref([{ email: 'zed@x.com', display_name: 'Zed', phone: '+15551230009', source: 'past-guest' }]),
  pending: ref(false),
  error: ref(null)
}))
mockNuxtImport('useInviteOptions', () => () => ({ save: saveOptionsFn }))
mockNuxtImport('useEventReminders', () => () => ({ setEnabled: async () => {} }))
mockNuxtImport('useEventRsvps', () => () => ({
  roster: ref({
    going: [{ key: 'u1', name: 'Ada', email: 'ada@x.com', avatar: null, status: 'going', plusOnes: 0, viaEmail: false }],
    maybe: [],
    no: [],
    noReply: [{ key: 'b@x.com', name: 'Bo', email: 'b@x.com' }],
    total: 1,
    headcount: 1
  }),
  error: ref(null),
  refresh: async () => {}
}))

const clickSend = async (w: { findAll: (s: string) => Array<{ text: () => string, trigger: (e: string) => Promise<void> }> }): Promise<void> => {
  const send = w.findAll('button').find(b => b.text().includes('Send'))
  await send!.trigger('click')
  await flushPromises()
}

beforeEach(() => {
  document.body.innerHTML = ''
  toasts.length = 0
  setRsvpFn.mockReset()
  notifyRsvpFn.mockReset()
  notifyRsvpFn.mockResolvedValue({ sent: 1, failed: 0, error: null })
  setPhoneFn.mockReset()
  markTextedFn.mockReset()
  sendFn.mockReset()
  sendFn.mockResolvedValue({ sent: 0, failed: 0, error: null })
  remindFn.mockReset()
  remindFn.mockResolvedValue({ sent: 0, failed: 0, error: null })
})

describe('EventInviteManager', () => {
  it('shows the tracker stats and the guest list', async () => {
    const w = await mountSuspended(EventInviteManager, { props: { eventId: 'e' } })
    expect(w.text()).toContain('invited')
    expect(w.text()).toContain('going')
    expect(w.text()).toContain('Pat')
    expect(w.text()).toContain('Going')
  })

  it('selects all guests and bulk-deletes them', async () => {
    const w = await mountSuspended(EventInviteManager, { props: { eventId: 'e' } })
    await w.get('[aria-label="Select all guests"]').trigger('click')
    // The delete button surfaces with the selected count.
    const del = w.findAll('button').find(b => b.text().includes('Delete'))
    expect(del).toBeTruthy()
    await del!.trigger('click')
    expect(removeMany).toHaveBeenCalledWith(['a', 'b'])
  })

  it('selects a single guest by their row checkbox', async () => {
    removeMany.mockClear()
    const w = await mountSuspended(EventInviteManager, { props: { eventId: 'e' } })
    await w.get('[aria-label="Select Sam"]').trigger('click')
    const del = w.findAll('button').find(b => b.text().includes('Delete'))
    await del!.trigger('click')
    expect(removeMany).toHaveBeenCalledWith(['b'])
  })

  it('adds a guest picked from the directory search', async () => {
    addFn.mockClear()
    const w = await mountSuspended(EventInviteManager, { props: { eventId: 'e' } })
    await w.get('[aria-label="Search people or enter an email"]').setValue('zed')
    await w.get('[aria-label="Add Zed"]').trigger('click')
    await flushPromises()
    expect(addFn).toHaveBeenCalledWith('zed@x.com', 'Zed', '+15551230009')
  })

  it('does not auto-pull from the last event on load, even when the list is empty', async () => {
    seedFn.mockClear()
    const saved = invites.value
    invites.value = []
    try {
      await mountSuspended(EventInviteManager, { props: { eventId: 'fresh-event' } })
      await flushPromises()
      expect(seedFn).not.toHaveBeenCalled()
    } finally {
      invites.value = saved
    }
  })

  it('pulls from the last event only when the button is clicked', async () => {
    seedFn.mockClear()
    const w = await mountSuspended(EventInviteManager, { props: { eventId: 'e' } })
    const pull = w.findAll('button').find(b => b.text().includes('Pull from last event'))
    await pull!.trigger('click')
    expect(seedFn).toHaveBeenCalledTimes(1)
  })

  it('surfaces the failure reason when a send is rejected (not a fake success)', async () => {
    sendFn.mockResolvedValue({ sent: 0, failed: 1, error: 'The benteenscreenonthegreen.com domain is not verified' })
    const w = await mountSuspended(EventInviteManager, { props: { eventId: 'e' } })
    await clickSend(w)
    const toast = toasts.at(-1)
    expect(toast?.color).toBe('error')
    expect(toast?.title).toContain('Couldn\'t send')
    expect(toast?.description).toBe('The benteenscreenonthegreen.com domain is not verified')
  })

  it('reports a fully successful send', async () => {
    sendFn.mockResolvedValue({ sent: 2, failed: 0, error: null })
    const w = await mountSuspended(EventInviteManager, { props: { eventId: 'e' } })
    await clickSend(w)
    const toast = toasts.at(-1)
    expect(toast?.color).toBe('success')
    expect(toast?.title).toBe('Sent 2 invites')
  })

  it('reports a partial send (some sent, some failed)', async () => {
    sendFn.mockResolvedValue({ sent: 1, failed: 1, error: 'rejected' })
    const w = await mountSuspended(EventInviteManager, { props: { eventId: 'e' } })
    await clickSend(w)
    const toast = toasts.at(-1)
    expect(toast?.color).toBe('warning')
    expect(toast?.title).toBe('Sent 1, 1 failed')
  })

  it('only says "everyone already invited" when nothing was queued', async () => {
    sendFn.mockResolvedValue({ sent: 0, failed: 0, error: null })
    const w = await mountSuspended(EventInviteManager, { props: { eventId: 'e' } })
    await clickSend(w)
    expect(toasts.at(-1)?.title).toBe('Everyone has already been invited')
  })

  it('shows the e-vite editor only when an event is provided', async () => {
    const without = await mountSuspended(EventInviteManager, { props: { eventId: 'e' } })
    expect(without.findAll('button').some(b => b.text().includes('Customize the e-vite'))).toBe(false)
    const withEvent = await mountSuspended(EventInviteManager, { props: { eventId: 'e', event: eventObj } })
    expect(withEvent.findAll('button').some(b => b.text().includes('Customize the e-vite'))).toBe(true)
  })

  it('renders a live preview built from the event + options', async () => {
    const w = await mountSuspended(EventInviteManager, { props: { eventId: 'e', event: eventObj } })
    const iframe = w.find('iframe')
    expect(iframe.exists()).toBe(true)
    const srcdoc = iframe.attributes('srcdoc') ?? ''
    expect(srcdoc).toContain('The Goonies')
    expect(srcdoc).toContain('https://img/goonies.jpg') // poster on by default
  })

  it('saves the e-vite design', async () => {
    saveOptionsFn.mockClear()
    const w = await mountSuspended(EventInviteManager, { props: { eventId: 'e', event: eventObj } })
    // expand the editor, then save
    const trigger = w.findAll('button').find(b => b.text().includes('Customize the e-vite'))
    await trigger!.trigger('click')
    await flushPromises()
    const save = w.findAll('button').find(b => b.text().includes('Save design'))
    await save!.trigger('click')
    await flushPromises()
    expect(saveOptionsFn).toHaveBeenCalledTimes(1)
    expect(toasts.at(-1)?.title).toContain('saved')
  })

  // Mount with one e-vited, non-responding guest (rsvp null + sent_at) so the
  // remind button is enabled, click it, then restore the shared fixture.
  async function clickRemind(): Promise<void> {
    const prev = invites.value
    invites.value = [{ ...prev[1]!, rsvp: null, sent_at: 't' }]
    const w = await mountSuspended(EventInviteManager, { props: { eventId: 'e', event: eventObj } })
    await w.findAll('button').find(b => b.text().includes('Remind'))!.trigger('click')
    await flushPromises()
    invites.value = prev
  }

  it('reports a successful manual reminder', async () => {
    remindFn.mockResolvedValueOnce({ sent: 1, failed: 0, error: null })
    await clickRemind()
    expect(remindFn).toHaveBeenCalled()
    expect(toasts.at(-1)).toMatchObject({ title: 'Reminded 1 person', color: 'success' })
  })

  it('reports a partial manual reminder (some sent, some failed) with the reason', async () => {
    remindFn.mockResolvedValueOnce({ sent: 2, failed: 1, error: 'Unverified domain' })
    await clickRemind()
    expect(toasts.at(-1)).toMatchObject({ title: 'Reminded 2, 1 failed', description: 'Unverified domain', color: 'warning' })
  })

  it('reports an all-failed manual reminder as an error with the reason', async () => {
    remindFn.mockResolvedValueOnce({ sent: 0, failed: 2, error: 'Unverified domain' })
    await clickRemind()
    expect(toasts.at(-1)).toMatchObject({ title: 'Could not send reminders', description: 'Unverified domain', color: 'error' })
  })

  // The modal teleports to <body>; find its buttons there.
  function bodyButton(text: string): HTMLButtonElement | undefined {
    return [...document.querySelectorAll('button')].find(b => b.textContent?.includes(text))
  }

  it('shows the guest count on a going badge', async () => {
    const prev = invites.value
    invites.value = [{ ...prev[0]!, plus_ones: 2 }]
    try {
      const w = await mountSuspended(EventInviteManager, { props: { eventId: 'e' } })
      expect(w.text()).toContain('Going +2')
    } finally {
      invites.value = prev
    }
  })

  it('opens the RSVP-for-them modal from a guest row and saves the tapped answer', async () => {
    const w = await mountSuspended(EventInviteManager, { props: { eventId: 'e' } })
    await w.get('[aria-label="RSVP for Sam"]').trigger('click')
    await flushPromises()
    expect(document.body.textContent).toContain('RSVP for Sam')
    bodyButton('Maybe')!.click()
    await flushPromises()
    expect(setRsvpFn).toHaveBeenCalledWith('b', 'maybe', 0)
  })

  it('surfaces a failed on-behalf RSVP as an error toast', async () => {
    setRsvpFn.mockRejectedValueOnce(new Error('Admins only'))
    const w = await mountSuspended(EventInviteManager, { props: { eventId: 'e' } })
    await w.get('[aria-label="RSVP for Sam"]').trigger('click')
    await flushPromises()
    bodyButton('Going')!.click()
    await flushPromises()
    expect(toasts.at(-1)).toMatchObject({ title: 'Could not save Sam\'s RSVP', description: 'Admins only', color: 'error' })
  })

  it('emails the guest a confirmation of their recorded answer', async () => {
    const w = await mountSuspended(EventInviteManager, { props: { eventId: 'e' } })
    await w.get('[aria-label="RSVP for Pat"]').trigger('click') // Pat is already going
    await flushPromises()
    bodyButton('Email them')!.click()
    await flushPromises()
    expect(notifyRsvpFn).toHaveBeenCalledWith('a')
    expect(toasts.at(-1)).toMatchObject({ title: 'Confirmation emailed to Pat', color: 'success' })
  })

  // --- Texting from the host's phone ---------------------------------------
  function bodyLink(text: string): HTMLAnchorElement | undefined {
    return [...document.querySelectorAll('a')].find(a => a.textContent?.includes(text))
  }
  async function withInvites<T>(list: typeof invites.value, run: () => Promise<T>): Promise<T> {
    const prev = invites.value
    invites.value = list
    try {
      return await run()
    } finally {
      invites.value = prev
    }
  }

  it('shows Texted for a guest who was texted but has not replied', async () => {
    await withInvites([{ ...invites.value[1]!, texted_at: '2026-10-10T18:00:00Z', reminded_at: '2026-10-09T18:00:00Z' }], async () => {
      const w = await mountSuspended(EventInviteManager, { props: { eventId: 'e' } })
      expect(w.text()).toContain('Texted')
      expect(w.text()).not.toContain('Reminded')
    })
  })

  it('opens the text modal from a guest row with their personal RSVP link filled in, and stamps them texted', async () => {
    const w = await mountSuspended(EventInviteManager, { props: { eventId: 'e', event: eventObj } })
    await w.get('[aria-label="Text Pat"]').trigger('click')
    await flushPromises()
    expect(document.body.textContent).toContain('Text Pat')
    const message = document.querySelector<HTMLTextAreaElement>('[aria-label="Text message"]')!.value
    expect(message).toContain('Hey Pat!')
    expect(message).toContain('The Goonies')
    expect(message).toContain('/rsvp?token=1')
    const open = bodyLink('Open in Messages')!
    expect(open.getAttribute('href')).toMatch(/^sms:\+15551230001\?&body=/)
    open.click()
    await flushPromises()
    expect(setPhoneFn).not.toHaveBeenCalled() // number unchanged
    expect(markTextedFn).toHaveBeenCalledWith(['a'])
  })

  it('saves a number entered in the text modal', async () => {
    const w = await mountSuspended(EventInviteManager, { props: { eventId: 'e', event: eventObj } })
    await w.get('[aria-label="Text Sam"]').trigger('click')
    await flushPromises()
    const input = document.querySelector<HTMLInputElement>('[aria-label="Mobile number"]')!
    input.value = '555 123 4567'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await flushPromises()
    bodyButton('Save')!.click()
    await flushPromises()
    expect(setPhoneFn).toHaveBeenCalledWith('b', '+15551234567')
    expect(toasts.at(-1)).toMatchObject({ title: 'Number saved', color: 'success' })
  })

  it('group-texts everyone without a reply who has a number, with a general link, and stamps them', async () => {
    const [pat, sam] = invites.value
    await withInvites([
      pat!, // going — not nudged
      { ...sam!, phone: '+15551230002' },
      { ...sam!, id: 'c', email: 'cy@x.com', display_name: 'Cy', phone: '+15551230003' },
      { ...sam!, id: 'd', email: 'dee@x.com', display_name: 'Dee', phone: null }
    ], async () => {
      const w = await mountSuspended(EventInviteManager, { props: { eventId: 'e', event: eventObj } })
      await w.findAll('button').find(b => b.text().includes('Text people from your phone'))!.trigger('click')
      await flushPromises()
      const group = w.find('a[href^="sms:"]')
      expect(group.exists()).toBe(true)
      const href = group.attributes('href')!
      expect(href.startsWith('sms:+15551230002,+15551230003?&body=')).toBe(true)
      expect(decodeURIComponent(href)).toContain('Hey everyone!')
      expect(decodeURIComponent(href)).not.toContain('/rsvp?token=')
      expect(w.text()).toContain('Group text 2 who haven\'t replied')
      expect(w.text()).toContain('1 without a reply has no number yet')
      await group.trigger('click')
      await flushPromises()
      expect(markTextedFn).toHaveBeenCalledWith(['b', 'c'])
    })
  })

  it('has no group text to offer when no non-responder has a number', async () => {
    const w = await mountSuspended(EventInviteManager, { props: { eventId: 'e', event: eventObj } })
    expect(w.find('a[href^="sms:"]').exists()).toBe(false)
    expect(w.text()).toContain('No one to group text')
  })

  it('saves the text template with the e-vite settings', async () => {
    saveOptionsFn.mockClear()
    const w = await mountSuspended(EventInviteManager, { props: { eventId: 'e', event: eventObj } })
    await w.findAll('button').find(b => b.text().includes('Text people from your phone'))!.trigger('click')
    await flushPromises()
    await w.get('[aria-label="Text message template"]').setValue('Yo {name}, {link}')
    await w.findAll('button').find(b => b.text().includes('Save template'))!.trigger('click')
    await flushPromises()
    expect(saveOptionsFn).toHaveBeenCalledWith(expect.objectContaining({ textMessage: 'Yo {name}, {link}' }))
  })

  it('shows why a confirmation email failed instead of a fake success', async () => {
    notifyRsvpFn.mockResolvedValueOnce({ sent: 0, failed: 1, error: 'Domain not verified' })
    const w = await mountSuspended(EventInviteManager, { props: { eventId: 'e' } })
    await w.get('[aria-label="RSVP for Pat"]').trigger('click')
    await flushPromises()
    bodyButton('Email them')!.click()
    await flushPromises()
    expect(toasts.at(-1)).toMatchObject({ title: 'Could not email Pat', description: 'Domain not verified', color: 'error' })
  })
})
