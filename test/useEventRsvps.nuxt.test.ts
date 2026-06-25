// @vitest-environment nuxt
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import type { EventRsvpRoster } from '../app/composables/useEventRsvps'

// Controllable Supabase reads for the three tables the merge touches. Each test
// sets the fixtures, then we wait for the immediate-watch load to settle.
interface ProfileRow { id: string, display_name: string | null, email: string | null, avatar_url: string | null }
interface InviteRow { email: string, display_name: string | null, rsvp: string | null }
let rsvpRows: { user_id: string, status: string }[] = []
let profileRows: ProfileRow[] = []
let inviteRows: InviteRow[] = []

const supabase = {
  from(table: string) {
    if (table === 'rsvps') {
      return { select: () => ({ eq: () => Promise.resolve({ data: rsvpRows, error: null }) }) }
    }
    if (table === 'profiles') {
      return { select: () => ({ in: () => Promise.resolve({ data: profileRows, error: null }) }) }
    }
    // event_invites
    return { select: () => ({ eq: () => Promise.resolve({ data: inviteRows, error: null }) }) }
  },
  channel() {
    const ch = { on: () => ch, subscribe: () => ch }
    return ch
  },
  removeChannel() {}
}

mockNuxtImport('useSupabaseClient', () => () => supabase)

async function settle(roster: { value: EventRsvpRoster }): Promise<void> {
  await vi.waitFor(() => {
    // Loaded once the roster reflects the fixtures (or is knowably empty).
    if (rsvpRows.length + inviteRows.length > 0 && roster.value.total === 0 && roster.value.noReply.length === 0) {
      throw new Error('not loaded yet')
    }
  })
  await nextTick()
}

// Reset every fixture between tests so a stray value can't leak across cases — each
// test declares the full state it depends on.
beforeEach(() => {
  rsvpRows = []
  profileRows = []
  inviteRows = []
})

describe('useEventRsvps', () => {
  it('rolls up in-app member RSVPs with names + avatars', async () => {
    rsvpRows = [{ user_id: 'u1', status: 'going' }, { user_id: 'u2', status: 'maybe' }]
    profileRows = [
      { id: 'u1', display_name: 'Ada', email: 'ada@x.com', avatar_url: 'ada.jpg' },
      { id: 'u2', display_name: 'Bo', email: 'bo@x.com', avatar_url: null }
    ]
    inviteRows = []
    const { roster } = useEventRsvps(ref('e1'))
    await settle(roster)
    expect(roster.value.going.map(p => p.name)).toEqual(['Ada'])
    expect(roster.value.going[0]!.avatar).toBe('ada.jpg')
    expect(roster.value.maybe.map(p => p.name)).toEqual(['Bo'])
    expect(roster.value.total).toBe(2)
  })

  it('folds email-only guests in and flags them viaEmail', async () => {
    rsvpRows = []
    profileRows = []
    inviteRows = [
      { email: 'guest@x.com', display_name: 'Guest', rsvp: 'going' },
      { email: 'silent@x.com', display_name: null, rsvp: null }
    ]
    const { roster } = useEventRsvps(ref('e1'))
    await settle(roster)
    expect(roster.value.going).toHaveLength(1)
    expect(roster.value.going[0]).toMatchObject({ name: 'Guest', viaEmail: true })
    // A guest with no reply lands in noReply, named by email when display_name is null.
    expect(roster.value.noReply.map(p => p.name)).toEqual(['silent@x.com'])
    expect(roster.value.total).toBe(1)
  })

  it('dedupes a member who is also on the e-vite list (in-app wins)', async () => {
    rsvpRows = [{ user_id: 'u1', status: 'going' }]
    profileRows = [{ id: 'u1', display_name: 'Ada', email: 'Ada@x.com', avatar_url: null }]
    // Same person on the guest list (case-insensitive email), with a stale 'maybe'.
    inviteRows = [{ email: 'ada@x.com', display_name: 'Ada', rsvp: 'maybe' }]
    const { roster } = useEventRsvps(ref('e1'))
    await settle(roster)
    expect(roster.value.total).toBe(1)
    expect(roster.value.going).toHaveLength(1)
    expect(roster.value.maybe).toHaveLength(0)
    expect(roster.value.going[0]!.viaEmail).toBe(false)
  })

  it('settles on an all-no-reply guest list (total stays 0, everyone in noReply)', async () => {
    // The settle edge case: invites exist but nobody replied, so `total` never leaves
    // 0 and the load is only observable via `noReply` populating.
    inviteRows = [
      { email: 'a@x.com', display_name: 'A', rsvp: null },
      { email: 'b@x.com', display_name: null, rsvp: null }
    ]
    const { roster } = useEventRsvps(ref('e1'))
    await settle(roster)
    expect(roster.value.total).toBe(0)
    expect(roster.value.going).toHaveLength(0)
    expect(roster.value.noReply.map(p => p.name)).toEqual(['A', 'b@x.com'])
  })
})
