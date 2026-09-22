// @vitest-environment nuxt
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { useAnnounceRecipients } from '../app/composables/useAnnounceRecipients'
import type { AnnouncePerson } from '../shared/utils/announce'

const person = (over: Partial<AnnouncePerson> & { email: string }): AnnouncePerson => ({
  name: null, rsvp: null, onGuestList: true, joined: true, onRoster: true, ...over
})

const DIRECTORY: AnnouncePerson[] = [
  person({ email: 'ada@example.com', name: 'Ada', rsvp: 'maybe' }),
  person({ email: 'grace@example.com', name: 'Grace', rsvp: 'going' }),
  person({ email: 'hedy@example.com', name: 'Hedy', rsvp: null }),
  person({ email: 'new@example.com', name: 'Newcomer', onGuestList: false, joined: false })
]

const requests: string[] = []
let respond: () => Promise<{ people: AnnouncePerson[] }>

beforeEach(() => {
  requests.length = 0
  respond = () => Promise.resolve({ people: DIRECTORY })
  vi.stubGlobal('$fetch', (url: string) => {
    requests.push(url)
    return respond()
  })
})
afterEach(() => vi.unstubAllGlobals())

describe('useAnnounceRecipients', () => {
  it('opens on the people who have RSVP\'d yes', async () => {
    const { people, selected, activeScope } = useAnnounceRecipients('e1')
    await flushPromises()
    expect(requests).toEqual(['/api/events/e1/announce-recipients'])
    expect(people.value).toHaveLength(4)
    expect(selected.value).toEqual(['grace@example.com'])
    expect(activeScope.value).toBe('going')
  })

  it('asks for nobody until an event is chosen', async () => {
    const { people } = useAnnounceRecipients(ref(undefined))
    await flushPromises()
    expect(requests).toHaveLength(0)
    expect(people.value).toEqual([])
  })

  it('reloads and returns to the default when the event changes', async () => {
    const eventId = ref('e1')
    const { selected, toggle } = useAnnounceRecipients(eventId)
    await flushPromises()
    toggle('ada@example.com')
    eventId.value = 'e2'
    await flushPromises()
    expect(requests).toEqual(['/api/events/e1/announce-recipients', '/api/events/e2/announce-recipients'])
    expect(selected.value).toEqual(['grace@example.com'])
  })

  it('counts every group so the blast radius is visible before choosing', async () => {
    const { counts } = useAnnounceRecipients('e1')
    await flushPromises()
    expect(counts.value).toMatchObject({
      going: 1, going_maybe: 2, no_reply: 1, guests: 3, members: 3, invited: 4
    })
  })

  it('re-picks the whole list from a group', async () => {
    const { selected, applyPreset, activeScope } = useAnnounceRecipients('e1')
    await flushPromises()
    applyPreset('guests')
    expect(selected.value).toEqual(['ada@example.com', 'grace@example.com', 'hedy@example.com'])
    expect(activeScope.value).toBe('guests')
  })

  it('calls the audience hand-picked once it stops matching a group', async () => {
    const { activeScope, toggle } = useAnnounceRecipients('e1')
    await flushPromises()
    toggle('hedy@example.com')
    expect(activeScope.value).toBe('custom')
  })

  it('adds someone who is not in the current group', async () => {
    const { selected, toggle } = useAnnounceRecipients('e1')
    await flushPromises()
    toggle('new@example.com')
    expect(selected.value).toContain('new@example.com')
    expect(selected.value).toContain('grace@example.com')
  })

  it('searches by name and by address', async () => {
    const { visible, search } = useAnnounceRecipients('e1')
    await flushPromises()
    search.value = 'hedy'
    expect(visible.value.map(p => p.email)).toEqual(['hedy@example.com'])
    search.value = 'NEW@ex'
    expect(visible.value.map(p => p.email)).toEqual(['new@example.com'])
    search.value = ''
    expect(visible.value).toHaveLength(4)
  })

  it('ticks only what the search shows, leaving the rest of the selection alone', async () => {
    const { selected, search, setVisible, allVisibleSelected } = useAnnounceRecipients('e1')
    await flushPromises()
    search.value = 'ada'
    expect(allVisibleSelected.value).toBe(false)
    setVisible(true)
    expect(selected.value.sort()).toEqual(['ada@example.com', 'grace@example.com'])
    expect(allVisibleSelected.value).toBe(true)
  })

  it('unticks only what the search shows', async () => {
    const { selected, search, applyPreset, setVisible } = useAnnounceRecipients('e1')
    await flushPromises()
    applyPreset('guests')
    search.value = 'hedy'
    setVisible(false)
    expect(selected.value.sort()).toEqual(['ada@example.com', 'grace@example.com'])
  })

  it('clears the search when the event changes, so the picker is never secretly filtered', async () => {
    const eventId = ref('e1')
    const { search, visible } = useAnnounceRecipients(eventId)
    await flushPromises()
    search.value = 'hedy'
    eventId.value = 'e2'
    await flushPromises()
    expect(search.value).toBe('')
    expect(visible.value).toHaveLength(4)
  })

  it('reports a failed load and selects nobody rather than guessing', async () => {
    respond = () => Promise.reject(new Error('boom'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { error, selected, people } = useAnnounceRecipients('e1')
    await flushPromises()
    expect(error.value).toBe('Could not load the recipient list')
    expect(people.value).toEqual([])
    expect(selected.value).toEqual([])
  })

  it('ignores a slow response for an event the admin has already left', async () => {
    let releaseFirst: (() => void) | undefined
    let call = 0
    respond = () => {
      call += 1
      if (call === 1) {
        return new Promise((resolve) => {
          releaseFirst = () => resolve({ people: DIRECTORY })
        })
      }
      return Promise.resolve({ people: [person({ email: 'only@example.com', rsvp: 'going' })] })
    }
    const eventId = ref('e1')
    const { selected } = useAnnounceRecipients(eventId)
    await flushPromises()
    eventId.value = 'e2'
    await flushPromises()
    releaseFirst?.()
    await flushPromises()
    expect(selected.value).toEqual(['only@example.com'])
  })
})
