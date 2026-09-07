// @vitest-environment nuxt
import { beforeEach, describe, expect, it } from 'vitest'
import { ref } from 'vue'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import GuestPicker from '../app/components/GuestPicker.vue'
import type { GuestCandidate } from '../shared/utils/guestDirectory'

interface Toast { title?: string, color?: string }
const toasts: Toast[] = []
const candidates = ref<GuestCandidate[]>([
  { email: 'ada@x.com', display_name: 'Ada Lovelace', source: 'member' },
  { email: 'bo@x.com', display_name: 'Bo', source: 'past-guest' },
  { email: 'cy@x.com', display_name: null, source: 'roster' }
])
mockNuxtImport('useGuestDirectory', () => () => ({ candidates, pending: ref(false), refresh: async () => {} }))
mockNuxtImport('useToast', () => () => ({ add: (t: Toast) => toasts.push(t) }))

const searchBox = (w: Awaited<ReturnType<typeof mountSuspended>>) => w.get('[aria-label="Search people or enter an email"]')

beforeEach(() => {
  toasts.length = 0
})

describe('GuestPicker', () => {
  it('shows no matches until something is typed', async () => {
    const w = await mountSuspended(GuestPicker)
    expect(w.find('[aria-label="Matching people"]').exists()).toBe(false)
  })

  it('live-searches the directory by name and shows where each match comes from', async () => {
    const w = await mountSuspended(GuestPicker)
    await searchBox(w).setValue('love')
    const list = w.get('[aria-label="Matching people"]')
    expect(list.text()).toContain('Ada Lovelace')
    expect(list.text()).toContain('Member')
    expect(list.text()).not.toContain('Bo')
  })

  it('emits add with the match\'s email and name when a match is picked', async () => {
    const w = await mountSuspended(GuestPicker)
    await searchBox(w).setValue('bo')
    await w.get('[aria-label="Add Bo"]').trigger('click')
    expect(w.emitted('add')?.[0]).toEqual(['bo@x.com', 'Bo'])
    // The field resets for the next search.
    expect((searchBox(w).element as HTMLInputElement).value).toBe('')
  })

  it('hides people already on the guest list', async () => {
    const w = await mountSuspended(GuestPicker, { props: { exclude: ['ada@x.com'] } })
    await searchBox(w).setValue('x.com')
    const list = w.get('[aria-label="Matching people"]')
    expect(list.text()).not.toContain('Ada')
    expect(list.text()).toContain('Bo')
  })

  it('adds a brand-new email with the optional name', async () => {
    const w = await mountSuspended(GuestPicker)
    await searchBox(w).setValue('New@Example.com')
    await w.get('input[placeholder="Jordan"]').setValue('Newbie')
    await w.findAll('button').find(b => b.text().trim() === 'Add')!.trigger('click')
    expect(w.emitted('add')?.[0]).toEqual(['new@example.com', 'Newbie'])
  })

  it('warns instead of adding when the text is neither a match nor an email', async () => {
    const w = await mountSuspended(GuestPicker)
    await searchBox(w).setValue('zzz')
    await searchBox(w).trigger('keydown', { key: 'Enter' })
    expect(w.emitted('add')).toBeUndefined()
    expect(toasts.at(-1)?.color).toBe('warning')
    expect(w.text()).toContain('No one matches')
  })

  it('picks the only match on Enter', async () => {
    const w = await mountSuspended(GuestPicker)
    await searchBox(w).setValue('cy')
    await searchBox(w).trigger('keydown', { key: 'Enter' })
    expect(w.emitted('add')?.[0]).toEqual(['cy@x.com', undefined])
  })
})
