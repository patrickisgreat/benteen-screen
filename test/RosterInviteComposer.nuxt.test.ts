// @vitest-environment nuxt
import { beforeEach, describe, expect, it } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import RosterInviteComposer from '../app/components/RosterInviteComposer.vue'
import type { RosterAddResult } from '../app/composables/useRoster'

const calls: string[] = []
const toasts: Array<{ title?: string, description?: string }> = []
let result: RosterAddResult = { added: 0, skipped: 0, emailed: 0, failed: 0, invalid: [], error: null }
let existing = new Set<string>()

const roster = ref([
  { email: 'sam@x.com', invited_by: null, display_name: 'Sam Riley', created_at: '2026-01-01', accepted_at: '2026-01-02' },
  { email: 'jo@x.com', invited_by: null, display_name: null, created_at: '2026-01-03', accepted_at: null }
])

mockNuxtImport('useRoster', () => () => ({
  roster,
  pending: ref(false),
  pendingCount: computed(() => roster.value.filter(r => !r.accepted_at).length),
  existingEmails: computed(() => existing),
  loadError: ref(null),
  refresh: async () => {},
  addToRoster: async (text: string) => {
    calls.push(text)
    return result
  }
}))
mockNuxtImport('useToast', () => () => ({ add: (t: { title?: string, description?: string }) => { toasts.push(t) } }))

async function typeEmails(wrapper: Awaited<ReturnType<typeof mountSuspended>>, value: string): Promise<void> {
  const box = wrapper.find('[data-testid="roster-emails"]')
  await box.setValue(value)
  await flushPromises()
}

function submitButton(wrapper: Awaited<ReturnType<typeof mountSuspended>>) {
  return wrapper.find('[data-testid="roster-submit"]')
}

beforeEach(() => {
  calls.length = 0
  toasts.length = 0
  existing = new Set<string>()
  result = { added: 0, skipped: 0, emailed: 0, failed: 0, invalid: [], error: null }
})

describe('RosterInviteComposer', () => {
  it('explains that the club is between screenings', async () => {
    const wrapper = await mountSuspended(RosterInviteComposer)
    expect(wrapper.text()).toContain('between screenings')
  })

  it('lists the people who will be added as you type', async () => {
    const wrapper = await mountSuspended(RosterInviteComposer)
    await typeEmails(wrapper, 'Sam Riley <new@x.com>\nsecond@x.com')
    expect(wrapper.text()).toContain('Sam Riley')
    expect(wrapper.text()).toContain('second@x.com')
  })

  it('counts the additions in the submit button label', async () => {
    const wrapper = await mountSuspended(RosterInviteComposer)
    await typeEmails(wrapper, 'a@x.com, b@x.com')
    expect(submitButton(wrapper).text()).toContain('Add 2')
  })

  it('flags people already in the club instead of offering to re-add them', async () => {
    existing = new Set(['sam@x.com'])
    const wrapper = await mountSuspended(RosterInviteComposer)
    await typeEmails(wrapper, 'sam@x.com\nnew@x.com')
    expect(wrapper.text()).toContain('1 already in the club')
    expect(submitButton(wrapper).text()).toContain('Add 1')
  })

  it('warns about fragments that are not addresses', async () => {
    const wrapper = await mountSuspended(RosterInviteComposer)
    await typeEmails(wrapper, 'good@x.com\nnot-an-email')
    expect(wrapper.text()).toContain("couldn't be read as an email")
    expect(wrapper.text()).toContain('not-an-email')
  })

  it('disables the button until there is somebody new to add', async () => {
    existing = new Set(['sam@x.com'])
    const wrapper = await mountSuspended(RosterInviteComposer)
    expect(submitButton(wrapper).attributes('disabled')).toBeDefined()
    await typeEmails(wrapper, 'sam@x.com')
    expect(submitButton(wrapper).attributes('disabled')).toBeDefined()
  })

  it('sends the pasted list and clears the box on success', async () => {
    result = { added: 2, skipped: 0, emailed: 2, failed: 0, invalid: [], error: null }
    const wrapper = await mountSuspended(RosterInviteComposer)
    await typeEmails(wrapper, 'a@x.com, b@x.com')
    await submitButton(wrapper).trigger('click')
    await flushPromises()
    expect(calls[0]).toContain('a@x.com')
    expect(toasts[0]?.title).toContain('Added 2 to the club')
    expect((wrapper.find('[data-testid="roster-emails"]').element as HTMLTextAreaElement).value).toBe('')
  })

  it('says so when the welcome emails could not be sent', async () => {
    result = { added: 2, skipped: 0, emailed: 0, failed: 2, invalid: [], error: 'domain not verified' }
    const wrapper = await mountSuspended(RosterInviteComposer)
    await typeEmails(wrapper, 'a@x.com, b@x.com')
    await submitButton(wrapper).trigger('click')
    await flushPromises()
    expect(toasts[0]?.title).toContain('2 emails failed')
    expect(toasts[0]?.description).toBe('domain not verified')
  })

  it('shows the roster with who has joined and who is still pending', async () => {
    const wrapper = await mountSuspended(RosterInviteComposer)
    expect(wrapper.text()).toContain('2 people')
    expect(wrapper.text()).toContain('1 yet to sign in')
    expect(wrapper.text()).toContain('Joined')
    expect(wrapper.text()).toContain('Invited')
  })
})
