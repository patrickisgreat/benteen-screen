// @vitest-environment nuxt
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import AnnounceAudiencePicker from '../app/components/AnnounceAudiencePicker.vue'
import type { GuestCandidate } from '../shared/utils/guestDirectory'

interface Body { eventId?: string, scope?: string, emails?: string[], preview?: boolean }
const calls: Body[] = []
const candidates = ref<GuestCandidate[]>([
  { email: 'ada@x.com', display_name: 'Ada Lovelace', source: 'member' },
  { email: 'bo@x.com', display_name: 'Bo', source: 'past-guest' }
])
mockNuxtImport('useGuestDirectory', () => () => ({ candidates, pending: ref(false), error: ref(null) }))
mockNuxtImport('useToast', () => () => ({ add: () => {} }))

let previewResult: { count: number, recipients: Array<{ email: string, name: string | null }> } | Error

// Let the (zero-ms) preview debounce fire, then the fetch settle.
async function settle(): Promise<void> {
  await new Promise(r => setTimeout(r, 5))
  await flushPromises()
}

async function mount(props: { scope?: string, emails?: string[], eventId?: string } = {}) {
  return await mountSuspended(AnnounceAudiencePicker, {
    props: { scope: 'guests', emails: [], eventId: 'e1', debounceMs: 0, ...props }
  })
}

const radios = (w: Awaited<ReturnType<typeof mount>>) => w.findAll('[role="radio"]')

beforeEach(() => {
  calls.length = 0
  previewResult = { count: 2, recipients: [{ email: 'ada@x.com', name: 'Ada Lovelace' }, { email: 'bo@x.com', name: null }] }
  vi.stubGlobal('$fetch', (_url: string, opts: { body: Body }) => {
    calls.push(opts.body)
    return previewResult instanceof Error ? Promise.reject(previewResult) : Promise.resolve({ ok: true, ...previewResult })
  })
})
afterEach(() => vi.unstubAllGlobals())

describe('AnnounceAudiencePicker', () => {
  it('spells out every audience with a description', async () => {
    const w = await mount()
    expect(w.text()).toContain('This night\'s guest list')
    expect(w.text()).toContain('Whole club roster')
    expect(w.text()).toContain('The biggest list')
    expect(radios(w)).toHaveLength(5)
  })

  it('previews the audience on mount and reports the count', async () => {
    const w = await mount()
    await settle()
    expect(calls[0]).toEqual({ eventId: 'e1', scope: 'guests', emails: undefined, preview: true })
    expect(w.get('[data-testid="audience-summary"]').text()).toBe('Will email 2 people')
    expect(w.emitted('count')?.at(-1)).toEqual([2])
  })

  it('lists who will get it on request', async () => {
    const w = await mount()
    await settle()
    await w.findAll('button').find(b => b.text().includes('Show who'))!.trigger('click')
    await flushPromises()
    expect(w.text()).toContain('Ada Lovelace, bo@x.com')
  })

  it('re-previews when the audience changes', async () => {
    const w = await mount()
    await settle()
    await radios(w)[4]!.trigger('click') // whole club roster
    await settle()
    expect(w.emitted('update:scope')?.at(-1)).toEqual(['invited'])
  })

  it('says so when nobody matches, and reports zero', async () => {
    previewResult = { count: 0, recipients: [] }
    const w = await mount()
    await settle()
    expect(w.get('[data-testid="audience-summary"]').text()).toContain('No one matches')
    expect(w.emitted('count')?.at(-1)).toEqual([0])
  })

  it('a custom audience previews nothing until someone is picked', async () => {
    const w = await mount({ scope: 'custom' })
    await settle()
    expect(calls).toHaveLength(0)
    expect(w.get('[data-testid="audience-summary"]').text()).toBe('Pick at least one person.')
    expect(w.emitted('count')?.at(-1)).toEqual([0])
  })

  it('picks people from the directory into chips and previews exactly them', async () => {
    const w = await mount({ scope: 'custom' })
    await w.get('[aria-label="Search people or enter an email"]').setValue('ada')
    await w.get('[aria-label="Add Ada Lovelace"]').trigger('click')
    await settle()
    expect(w.emitted('update:emails')?.at(-1)).toEqual([['ada@x.com']])
    expect(w.get('[aria-label="Chosen people"]').text()).toContain('Ada Lovelace')
    expect(calls.at(-1)).toMatchObject({ scope: 'custom', emails: ['ada@x.com'], preview: true })
  })

  it('removes a chip and drops them from the audience', async () => {
    const w = await mount({ scope: 'custom' })
    await w.get('[aria-label="Search people or enter an email"]').setValue('bo')
    await w.get('[aria-label="Add Bo"]').trigger('click')
    await w.get('[aria-label="Remove Bo"]').trigger('click')
    expect(w.emitted('update:emails')?.at(-1)).toEqual([[]])
    expect(w.find('[aria-label="Chosen people"]').exists()).toBe(false)
  })

  it('surfaces a preview failure and reports an unknown count', async () => {
    previewResult = new Error('Admins only')
    const w = await mount()
    await settle()
    expect(w.get('[data-testid="audience-summary"]').text()).toBe('Admins only')
    expect(w.emitted('count')?.at(-1)).toEqual([null])
  })
})
