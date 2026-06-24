// @vitest-environment nuxt
import { beforeEach, describe, expect, it } from 'vitest'
import { nextTick, ref } from 'vue'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import type { OnlineUser } from '../app/composables/usePresence'

// A controllable Realtime-Presence channel: capture the presence callbacks, fire
// SUBSCRIBED on subscribe, record what we track, and return a settable roster.
const presenceCallbacks: Record<string, () => void> = {}
let tracked: Record<string, unknown> | null = null
let roster: Record<string, OnlineUser[]> = {}

const channelObj = {
  on(_type: string, filter: { event: string }, cb: () => void) {
    presenceCallbacks[filter.event] = cb
    return channelObj
  },
  subscribe(cb?: (status: string) => void) {
    cb?.('SUBSCRIBED')
    return channelObj
  },
  track(payload: Record<string, unknown>) {
    tracked = payload
    return Promise.resolve('ok')
  },
  presenceState() {
    return roster
  }
}

const supabase = { channel: () => channelObj, removeChannel() {} }

mockNuxtImport('useSupabaseClient', () => () => supabase)
mockNuxtImport('useAuth', () => () => ({
  account: ref({ id: 'me', displayName: 'Pat', avatarUrl: 'pat.jpg' }),
  myId: ref('me')
}))

beforeEach(() => {
  tracked = null
  roster = {}
})

describe('usePresence', () => {
  it('tracks the current user (id, name, avatar) once subscribed', async () => {
    usePresence(ref('e1'))
    await nextTick()
    expect(tracked).toMatchObject({ id: 'me', name: 'Pat', avatar: 'pat.jpg' })
  })

  it('exposes the deduped roster from presence state on sync', async () => {
    const { online } = usePresence(ref('e1'))
    roster = {
      me: [{ id: 'me', name: 'Pat', avatar: null }],
      bob: [{ id: 'bob', name: 'Bob', avatar: 'bob.jpg' }]
    }
    presenceCallbacks.sync?.()
    await nextTick()
    expect(online.value.map(u => u.id)).toEqual(['me', 'bob'])
  })

  it('collapses a user with multiple tabs into one entry', async () => {
    const { online } = usePresence(ref('e1'))
    roster = { me: [{ id: 'me', name: 'Pat', avatar: null }, { id: 'me', name: 'Pat', avatar: null }] }
    presenceCallbacks.join?.()
    await nextTick()
    expect(online.value).toHaveLength(1)
  })

  it('stays empty (and does not track) until an event id is set', async () => {
    usePresence(ref(null))
    await nextTick()
    expect(tracked).toBeNull()
  })
})
