// @vitest-environment nuxt
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { useAnnounceRecipients } from '../app/composables/useAnnounceRecipients'
import type { AnnounceScope } from '../shared/utils/announce'

const AUDIENCES: Record<string, Array<{ email: string, name: string | null }>> = {
  guests: [
    { email: 'ada@example.com', name: 'Ada' },
    { email: 'grace@example.com', name: 'Grace' }
  ],
  going: [{ email: 'grace@example.com', name: 'Grace' }]
}

const requests: Array<{ url: string, scope: unknown }> = []
let respond: (scope: string) => Promise<{ count: number, recipients: Array<{ email: string, name: string | null }> }>

beforeEach(() => {
  requests.length = 0
  respond = (scope: string) => {
    const recipients = AUDIENCES[scope] ?? []
    return Promise.resolve({ count: recipients.length, recipients })
  }
  vi.stubGlobal('$fetch', (url: string, opts: { query: { scope: string } }) => {
    requests.push({ url, scope: opts.query.scope })
    return respond(opts.query.scope)
  })
})
afterEach(() => vi.unstubAllGlobals())

describe('useAnnounceRecipients', () => {
  it('loads the audience for the event and scope, everyone ticked', async () => {
    const { recipients, selected, allSelected } = useAnnounceRecipients('e1', 'guests')
    await flushPromises()
    expect(requests[0]).toEqual({ url: '/api/events/e1/announce-recipients', scope: 'guests' })
    expect(recipients.value).toHaveLength(2)
    expect(selected.value).toEqual(['ada@example.com', 'grace@example.com'])
    expect(allSelected.value).toBe(true)
  })

  it('asks for nobody until an event is chosen', async () => {
    const { recipients } = useAnnounceRecipients(ref(undefined), 'guests')
    await flushPromises()
    expect(requests).toHaveLength(0)
    expect(recipients.value).toEqual([])
  })

  it('reloads and re-ticks everyone when the scope changes', async () => {
    const scope = ref<AnnounceScope>('guests')
    const { selected } = useAnnounceRecipients('e1', scope)
    await flushPromises()
    scope.value = 'going'
    await flushPromises()
    expect(requests.map(r => r.scope)).toEqual(['guests', 'going'])
    expect(selected.value).toEqual(['grace@example.com'])
  })

  it('unticks and re-ticks one person', async () => {
    const { selected, allSelected, toggle } = useAnnounceRecipients('e1', 'guests')
    await flushPromises()
    toggle('ada@example.com')
    expect(selected.value).toEqual(['grace@example.com'])
    expect(allSelected.value).toBe(false)
    toggle('ada@example.com')
    expect(selected.value).toContain('ada@example.com')
    expect(allSelected.value).toBe(true)
  })

  it('clears and restores the whole selection', async () => {
    const { selected, toggleAll } = useAnnounceRecipients('e1', 'guests')
    await flushPromises()
    toggleAll(false)
    expect(selected.value).toEqual([])
    toggleAll(true)
    expect(selected.value).toHaveLength(2)
  })

  it('is not "all selected" when the audience is empty', async () => {
    const { allSelected } = useAnnounceRecipients('e1', 'no_reply')
    await flushPromises()
    expect(allSelected.value).toBe(false)
  })

  it('reports a failed load and selects nobody rather than guessing', async () => {
    respond = () => Promise.reject(new Error('boom'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { error, selected, recipients } = useAnnounceRecipients('e1', 'guests')
    await flushPromises()
    expect(error.value).toBe('Could not load the recipient list')
    expect(recipients.value).toEqual([])
    expect(selected.value).toEqual([])
  })

  it('ignores a slow earlier scope that answers after a later one', async () => {
    let releaseFirst: (() => void) | undefined
    respond = (scope: string) => {
      const recipients = AUDIENCES[scope] ?? []
      const payload = { count: recipients.length, recipients }
      if (scope === 'guests') {
        return new Promise((resolve) => {
          releaseFirst = () => resolve(payload)
        })
      }
      return Promise.resolve(payload)
    }
    const scope = ref<AnnounceScope>('guests')
    const { selected } = useAnnounceRecipients('e1', scope)
    await flushPromises()
    scope.value = 'going'
    await flushPromises()
    releaseFirst?.()
    await flushPromises()
    expect(selected.value).toEqual(['grace@example.com'])
  })
})
