import { beforeEach, describe, expect, it } from 'vitest'
import { recordInviteRsvp } from '../server/utils/rsvp'

type Row = Record<string, unknown>
interface Calls {
  inviteUpdates: Array<{ patch: Row, id: unknown }>
  rsvpUpserts: Array<{ row: Row, opts: Row }>
  rsvpDeletes: Array<{ event_id: unknown, user_id: unknown }>
}

// A test double for the Supabase client: only the surface recordInviteRsvp
// touches (event_invites.update, profiles.select().ilike().maybeSingle(),
// rsvps.upsert / delete) is implemented, recording each call.
function makeFakeDb(opts: { memberId?: string | null, failOn?: 'event_invites' | 'profiles' | 'rsvps' } = {}) {
  const calls: Calls = { inviteUpdates: [], rsvpUpserts: [], rsvpDeletes: [] }
  const fail = (table: string) => (opts.failOn === table ? { message: `${table} failed` } : null)
  const from = (table: string) => {
    if (table === 'event_invites') {
      return {
        update: (patch: Row) => ({
          eq: (_col: string, id: unknown) => {
            calls.inviteUpdates.push({ patch, id })
            return Promise.resolve({ error: fail(table) })
          }
        })
      }
    }
    if (table === 'profiles') {
      return {
        select: () => ({
          ilike: () => ({
            maybeSingle: () => Promise.resolve({ data: opts.memberId ? { id: opts.memberId } : null, error: fail(table) })
          })
        })
      }
    }
    if (table === 'rsvps') {
      return {
        upsert: (row: Row, upsertOpts: Row) => {
          calls.rsvpUpserts.push({ row, opts: upsertOpts })
          return Promise.resolve({ error: fail(table) })
        },
        delete: () => ({
          eq: (_c1: string, event_id: unknown) => ({
            eq: (_c2: string, user_id: unknown) => {
              calls.rsvpDeletes.push({ event_id, user_id })
              return Promise.resolve({ error: fail(table) })
            }
          })
        })
      }
    }
    throw new Error(`unexpected table ${table}`)
  }
  // Cast at this test boundary: the helper only uses the chains stubbed above.
  return { db: { from } as unknown as Parameters<typeof recordInviteRsvp>[0], calls }
}

const invite = { id: 'inv-1', event_id: 'evt-1', email: 'Ada@X.com' }

let fake: ReturnType<typeof makeFakeDb>
beforeEach(() => {
  fake = makeFakeDb({ memberId: 'user-ada' })
})

describe('recordInviteRsvp', () => {
  it('records going + guests on the e-vite row and mirrors both into the member\'s RSVP', async () => {
    const result = await recordInviteRsvp(fake.db, invite, { status: 'going', plusOnes: 2 })
    expect(result).toEqual({ status: 'going', plusOnes: 2 })
    expect(fake.calls.inviteUpdates[0]).toMatchObject({ id: 'inv-1', patch: { rsvp: 'going', plus_ones: 2 } })
    expect(fake.calls.inviteUpdates[0]!.patch.rsvp_at).toEqual(expect.any(String))
    expect(fake.calls.rsvpUpserts[0]).toMatchObject({
      row: { event_id: 'evt-1', user_id: 'user-ada', status: 'going', plus_ones: 2 },
      opts: { onConflict: 'event_id,user_id' }
    })
  })

  it('drops the guest count when the reply is not going', async () => {
    const result = await recordInviteRsvp(fake.db, invite, { status: 'maybe', plusOnes: 3 })
    expect(result.plusOnes).toBe(0)
    expect(fake.calls.inviteUpdates[0]!.patch).toMatchObject({ rsvp: 'maybe', plus_ones: 0 })
    expect(fake.calls.rsvpUpserts[0]!.row).toMatchObject({ status: 'maybe', plus_ones: 0 })
  })

  it('stamps clicked_at only when asked (the one-click link), never for an admin reply', async () => {
    await recordInviteRsvp(fake.db, invite, { status: 'no', plusOnes: 0, markClicked: true })
    expect(fake.calls.inviteUpdates[0]!.patch.clicked_at).toEqual(expect.any(String))
    await recordInviteRsvp(fake.db, invite, { status: 'no', plusOnes: 0 })
    expect(fake.calls.inviteUpdates[1]!.patch).not.toHaveProperty('clicked_at')
  })

  it('clearing the reply resets the e-vite row and removes the member\'s RSVP row', async () => {
    const result = await recordInviteRsvp(fake.db, invite, { status: null, plusOnes: 2 })
    expect(result).toEqual({ status: null, plusOnes: 0 })
    expect(fake.calls.inviteUpdates[0]!.patch).toMatchObject({ rsvp: null, rsvp_at: null, plus_ones: 0 })
    expect(fake.calls.rsvpUpserts).toHaveLength(0)
    expect(fake.calls.rsvpDeletes).toEqual([{ event_id: 'evt-1', user_id: 'user-ada' }])
  })

  it('leaves rsvps alone for an email-only guest (no member profile)', async () => {
    fake = makeFakeDb({ memberId: null })
    await recordInviteRsvp(fake.db, invite, { status: 'going', plusOnes: 1 })
    expect(fake.calls.inviteUpdates).toHaveLength(1)
    expect(fake.calls.rsvpUpserts).toHaveLength(0)
    expect(fake.calls.rsvpDeletes).toHaveLength(0)
  })

  it('rethrows a failed e-vite write instead of silently continuing', async () => {
    fake = makeFakeDb({ memberId: 'user-ada', failOn: 'event_invites' })
    await expect(recordInviteRsvp(fake.db, invite, { status: 'going', plusOnes: 0 })).rejects.toMatchObject({ message: 'event_invites failed' })
    expect(fake.calls.rsvpUpserts).toHaveLength(0)
  })

  it('rethrows a failed member mirror so the caller can report it', async () => {
    fake = makeFakeDb({ memberId: 'user-ada', failOn: 'rsvps' })
    await expect(recordInviteRsvp(fake.db, invite, { status: 'going', plusOnes: 0 })).rejects.toMatchObject({ message: 'rsvps failed' })
  })
})
