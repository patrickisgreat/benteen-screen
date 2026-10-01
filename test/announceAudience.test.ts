import { describe, expect, it } from 'vitest'
import { resolveAnnounceAudience } from '../server/utils/announceAudience'

type Row = Record<string, unknown>

// Chainable PostgREST-ish stub: `.from(table)` resolves to the fixture rows for
// that table regardless of filters, except `event_invites` which honors the
// `rsvp` filter so the "going" merge can be exercised.
function makeFakeDb(fixtures: Record<string, Row[]>, failOn?: string) {
  const from = (table: string) => {
    const filters: Array<[string, unknown]> = []
    const chain: Record<string, unknown> = {
      select: () => chain,
      not: () => chain,
      in: () => chain,
      eq: (col: string, val: unknown) => {
        filters.push([col, val])
        return chain
      },
      then: (resolve: (v: unknown) => void) => {
        if (failOn === table) return resolve({ data: null, error: { message: `${table} failed` } })
        let rows = fixtures[table] ?? []
        const rsvp = filters.find(([c]) => c === 'rsvp')
        if (rsvp) rows = rows.filter(r => r.rsvp === rsvp[1])
        resolve({ data: rows, error: null })
      }
    }
    return chain
  }
  // Cast at this test boundary: the resolver only uses the chains stubbed above.
  return { from } as unknown as Parameters<typeof resolveAnnounceAudience>[0]
}

const eventId = 'evt-1'

describe('resolveAnnounceAudience', () => {
  it('guests = this event\'s e-vite list, deduped case-insensitively', async () => {
    const db = makeFakeDb({ event_invites: [
      { email: 'Ada@x.com', display_name: 'Ada', rsvp: null },
      { email: 'ada@x.com', display_name: null, rsvp: 'going' },
      { email: 'bo@x.com', display_name: null, rsvp: 'no' }
    ] })
    const out = await resolveAnnounceAudience(db, eventId, 'guests', [])
    expect(out).toEqual([{ email: 'ada@x.com', name: 'Ada' }, { email: 'bo@x.com', name: null }])
  })

  it('going merges in-app going members with e-vite guests who replied going', async () => {
    const db = makeFakeDb({
      rsvps: [{ user_id: 'u1' }],
      profiles: [{ email: 'member@x.com', display_name: 'Member' }],
      event_invites: [
        { email: 'guest@x.com', display_name: 'Guest', rsvp: 'going' },
        { email: 'nope@x.com', display_name: 'Nope', rsvp: 'no' },
        { email: 'member@x.com', display_name: null, rsvp: 'going' } // same person as u1
      ]
    })
    const out = await resolveAnnounceAudience(db, eventId, 'going', [])
    expect(out.map(r => r.email).sort()).toEqual(['guest@x.com', 'member@x.com'])
    expect(out.find(r => r.email === 'member@x.com')?.name).toBe('Member')
  })

  it('going with nobody RSVP\'d in-app still reaches e-vite going replies', async () => {
    const db = makeFakeDb({ rsvps: [], event_invites: [{ email: 'guest@x.com', display_name: null, rsvp: 'going' }] })
    expect(await resolveAnnounceAudience(db, eventId, 'going', [])).toEqual([{ email: 'guest@x.com', name: null }])
  })

  it('members and invited both read the club roster', async () => {
    const db = makeFakeDb({ invites: [{ email: 'a@x.com', display_name: 'A' }, { email: 'b@x.com', display_name: null }] })
    expect((await resolveAnnounceAudience(db, eventId, 'members', [])).map(r => r.email)).toEqual(['a@x.com', 'b@x.com'])
    expect((await resolveAnnounceAudience(db, eventId, 'invited', [])).map(r => r.email)).toEqual(['a@x.com', 'b@x.com'])
  })

  it('custom returns exactly the picked emails, naming the ones who are members', async () => {
    const db = makeFakeDb({ profiles: [{ email: 'ada@x.com', display_name: 'Ada' }] })
    const out = await resolveAnnounceAudience(db, eventId, 'custom', ['ada@x.com', 'new@x.com'])
    expect(out).toEqual([{ email: 'ada@x.com', name: 'Ada' }, { email: 'new@x.com', name: null }])
  })

  it('rethrows a query failure instead of silently emailing nobody', async () => {
    const db = makeFakeDb({}, 'event_invites')
    await expect(resolveAnnounceAudience(db, eventId, 'guests', [])).rejects.toMatchObject({ message: 'event_invites failed' })
  })
})
