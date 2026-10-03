// @vitest-environment nuxt
import { beforeEach, describe, expect, it } from 'vitest'
import { ref } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { createError } from 'h3'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import AnnounceAudiencePicker from '../app/components/AnnounceAudiencePicker.vue'
import type { GuestCandidate } from '../shared/utils/guestDirectory'
import { fakeApi } from './utils/fakeApi'

interface Body { eventId?: string, scope?: string, emails?: string[], preview?: boolean }
type Preview = { count: number, recipients: Array<{ email: string, name: string | null }> }
// What the next preview answers with: a result, a failure, or a function (to
// hold a response open and release it later).
let previewResult: Preview | Error | (() => Promise<Preview>)
const api = fakeApi(['/api/events/announce'], () => {
  if (previewResult instanceof Error) throw createError({ statusCode: 403, statusMessage: previewResult.message })
  if (typeof previewResult === 'function') return previewResult().then(r => ({ ok: true, ...r }))
  return { ok: true, ...previewResult }
})
const calls = () => api.calls.map(c => c.body as Body)
const candidates = ref<GuestCandidate[]>([
  { email: 'ada@x.com', display_name: 'Ada Lovelace', source: 'member' },
  { email: 'bo@x.com', display_name: 'Bo', source: 'past-guest' }
])
mockNuxtImport('useGuestDirectory', () => () => ({ candidates, pending: ref(false), error: ref(null) }))
mockNuxtImport('useToast', () => () => ({ add: () => {} }))

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
  api.reset()
  previewResult = { count: 2, recipients: [{ email: 'ada@x.com', name: 'Ada Lovelace' }, { email: 'bo@x.com', name: null }] }
})

describe('AnnounceAudiencePicker', () => {
  it('spells out every audience with a description', async () => {
    const w = await mount()
    expect(w.text()).toContain('This night\'s guest list')
    expect(w.text()).toContain('Whole club roster')
    expect(w.text()).toContain('The biggest list')
    expect(w.text()).toContain('Haven\'t opened the e-vite')
    expect(radios(w)).toHaveLength(6)
  })

  it('previews the audience on mount and reports the count', async () => {
    const w = await mount()
    await settle()
    expect(calls()[0]).toEqual({ eventId: 'e1', scope: 'guests', preview: true })
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
    await radios(w).at(-1)!.trigger('click') // whole club roster
    await settle()
    expect(w.emitted('update:scope')?.at(-1)).toEqual(['invited'])
  })

  it('ignores a slow earlier preview that lands after a newer one', async () => {
    // First request (guests) is held open; second (roster) resolves immediately.
    let releaseFirst: (() => void) | null = null
    let n = 0
    previewResult = () => {
      n += 1
      if (n === 1) {
        return new Promise((resolve) => {
          releaseFirst = () => resolve({ count: 1, recipients: [{ email: 'stale@x.com', name: 'Stale' }] })
        })
      }
      return Promise.resolve({ count: 50, recipients: [{ email: 'fresh@x.com', name: 'Fresh' }] })
    }
    const w = await mount()
    await settle()
    await radios(w)[4]!.trigger('click') // switch audiences while the first preview is still pending
    await settle()
    expect(w.emitted('count')?.at(-1)).toEqual([50])
    releaseFirst!()
    await settle()
    expect(w.emitted('count')?.at(-1), 'the stale result must not overwrite the fresh one').toEqual([50])
    expect(w.text()).not.toContain('Stale')
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
    expect(calls()).toHaveLength(0)
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
    expect(calls().at(-1)).toMatchObject({ scope: 'custom', emails: ['ada@x.com'], preview: true })
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
    expect(w.get('[data-testid="audience-summary"]').text()).toContain('Admins only')
    expect(w.emitted('count')?.at(-1)).toEqual([null])
  })
})
