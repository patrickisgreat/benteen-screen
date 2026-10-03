import { describe, expect, it } from 'vitest'
import { resolveAnnounceAudience } from '../server/utils/announceAudience'

type Row = Record<string, unknown>

// Chainable PostgREST-ish stub: `.from(table)` resolves to the fixture rows for
// that table, honoring the two filters the resolver relies on to narrow an
// audience — `.eq('rsvp', …)` for the going merge and `.not('accepted_at', 'is', null)`
// for members — so a regression dropping either filter fails here.
function makeFakeDb(fixtures: Record<string, Row[]>, failOn?: string) {
  const from = (table: string) => {
    const eqFilters: Array<[string, unknown]> = []
    const notNull: string[] = []
    const chain: Record<string, unknown> = {
      select: () => chain,
      in: () => chain,
      eq: (col: string, val: unknown) => {
        eqFilters.push([col, val])
        return chain
      },
      not: (col: string, op: string, val: unknown) => {
        if (op === 'is' && val === null) notNull.push(col)
        return chain
      },
      then: (resolve: (v: unknown) => void) => {
        if (failOn === table) return resolve({ data: null, error: { message: `${table} failed` } })
        let rows = fixtures[table] ?? []
        for (const [col, val] of eqFilters) rows = rows.filter(r => r[col] === val)
        for (const col of notNull) rows = rows.filter(r => r[col] != null)
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
      { email: 'Ada@x.com', display_name: 'Ada', rsvp: null, event_id: eventId },
      { email: 'ada@x.com', display_name: null, rsvp: 'going', event_id: eventId },
      { email: 'bo@x.com', display_name: null, rsvp: 'no', event_id: eventId }
    ] })
    const out = await resolveAnnounceAudience(db, eventId, 'guests', [])
    expect(out).toEqual([{ email: 'ada@x.com', name: 'Ada' }, { email: 'bo@x.com', name: null }])
  })

  it('unopened = guests sent the e-vite with no open, click, reply or bounce', async () => {
    const guest = (email: string, over: Row = {}): Row => ({
      email, display_name: null, event_id: eventId, sent_at: 't', opened_at: null, clicked_at: null, bounced_at: null, rsvp: null, ...over
    })
    const db = makeFakeDb({ event_invites: [
      guest('unseen@x.com', { display_name: 'Una' }),
      guest('opened@x.com', { opened_at: 't' }),
      guest('clicked@x.com', { clicked_at: 't' }),
      guest('replied@x.com', { rsvp: 'no' }),
      guest('bounced@x.com', { bounced_at: 't' }),
      guest('notsent@x.com', { sent_at: null }),
      guest('other-night@x.com', { event_id: 'evt-2' })
    ] })
    const out = await resolveAnnounceAudience(db, eventId, 'unopened', [])
    expect(out).toEqual([{ email: 'unseen@x.com', name: 'Una' }])
  })

  it('going merges in-app going members with e-vite guests who replied going', async () => {
    const db = makeFakeDb({
      rsvps: [{ user_id: 'u1', event_id: eventId, status: 'going' }],
      profiles: [{ email: 'member@x.com', display_name: 'Member' }],
      event_invites: [
        { email: 'guest@x.com', display_name: 'Guest', rsvp: 'going', event_id: eventId },
        { email: 'nope@x.com', display_name: 'Nope', rsvp: 'no', event_id: eventId },
        { email: 'member@x.com', display_name: null, rsvp: 'going', event_id: eventId } // same person as u1
      ]
    })
    const out = await resolveAnnounceAudience(db, eventId, 'going', [])
    expect(out.map(r => r.email).sort()).toEqual(['guest@x.com', 'member@x.com'])
    expect(out.find(r => r.email === 'member@x.com')?.name).toBe('Member')
  })

  it('going with nobody RSVP\'d in-app still reaches e-vite going replies', async () => {
    const db = makeFakeDb({ rsvps: [], event_invites: [{ email: 'guest@x.com', display_name: null, rsvp: 'going', event_id: eventId }] })
    expect(await resolveAnnounceAudience(db, eventId, 'going', [])).toEqual([{ email: 'guest@x.com', name: null }])
  })

  const roster = [
    { email: 'joined@x.com', display_name: 'Joined', accepted_at: '2026-06-01T00:00:00Z' },
    { email: 'pending@x.com', display_name: null, accepted_at: null }
  ]

  it('members = only roster entries who have accepted (signed in)', async () => {
    const out = await resolveAnnounceAudience(makeFakeDb({ invites: roster }), eventId, 'members', [])
    expect(out.map(r => r.email)).toEqual(['joined@x.com'])
  })

  it('invited = the whole roster, joined or not', async () => {
    const out = await resolveAnnounceAudience(makeFakeDb({ invites: roster }), eventId, 'invited', [])
    expect(out.map(r => r.email)).toEqual(['joined@x.com', 'pending@x.com'])
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
