// @vitest-environment nuxt
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import EventAnnounceComposer from '../app/components/EventAnnounceComposer.vue'

const calls: Array<{ url: string, body: unknown }> = []
mockNuxtImport('useToast', () => () => ({ add: () => {} }))

beforeEach(() => {
  calls.length = 0
  vi.stubGlobal('$fetch', (url: string, opts: { body: unknown }) => {
    calls.push({ url, body: opts.body })
    return Promise.resolve({ ok: true, count: 3 })
  })
})
afterEach(() => vi.unstubAllGlobals())

describe('EventAnnounceComposer', () => {
  it('posts the announcement for the selected event', async () => {
    const w = await mountSuspended(EventAnnounceComposer, { props: { eventId: 'e1' } })
    await w.find('textarea').setValue('Doors at 7')
    await w.find('form').trigger('submit')
    await flushPromises()
    expect(calls[0]?.url).toBe('/api/events/announce')
    expect(calls[0]?.body).toMatchObject({ eventId: 'e1', message: 'Doors at 7', scope: 'members' })
  })

  it('does not post an empty message', async () => {
    const w = await mountSuspended(EventAnnounceComposer, { props: { eventId: 'e1' } })
    await w.find('form').trigger('submit')
    await flushPromises()
    expect(calls).toHaveLength(0)
  })
})
