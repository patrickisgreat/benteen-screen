import { describe, expect, it } from 'vitest'
import { buildDateChangeMails, resolveDateChangeAudience, summarizeDateChangeAudience } from '../server/utils/reschedule'

type Row = Record<string, unknown>
type Db = Parameters<typeof resolveDateChangeAudience>[0]

// Chainable PostgREST-ish stub. It honors the two filters the resolver relies on
// to pick guests — `.not('sent_at', 'is', null)` and `.is('bounced_at', null)` —
// so dropping either one fails here.
function makeDb(fixtures: Record<string, Row[]>, failOn?: string) {
  const from = (table: string) => {
    const notNull: string[] = []
    const isNull: string[] = []
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: () => chain,
      in: () => chain,
      not: (column: string) => (notNull.push(column), chain),
      is: (column: string) => (isNull.push(column), chain),
      then: (resolve: (v: unknown) => void) => {
        if (failOn === table) return resolve({ data: null, error: { message: `${table} failed` } })
        let rows = fixtures[table] ?? []
        for (const column of notNull) rows = rows.filter(r => r[column] != null)
        for (const column of isNull) rows = rows.filter(r => r[column] == null)
        resolve({ data: rows, error: null })
      }
    }
    return chain
  }
  return { from } as unknown as Db
}

const guest = (email: string, over: Row = {}): Row => ({
  id: `inv-${email}`, email, display_name: null, token: `tok-${email}`, rsvp: null, sent_at: 't', bounced_at: null, ...over
})

describe('resolveDateChangeAudience', () => {
  it('includes every e-vited guest with their reply and one-click token', async () => {
    const db = makeDb({ event_invites: [guest('a@x.com', { display_name: 'Ada', rsvp: 'going' }), guest('b@x.com')] })
    expect(await resolveDateChangeAudience(db, 'e1')).toEqual([
      { email: 'a@x.com', name: 'Ada', inviteId: 'inv-a@x.com', token: 'tok-a@x.com', rsvp: 'going' },
      { email: 'b@x.com', name: null, inviteId: 'inv-b@x.com', token: 'tok-b@x.com', rsvp: null }
    ])
  })

  it('leaves out guests who were never e-vited or whose address bounced', async () => {
    const db = makeDb({ event_invites: [guest('sent@x.com'), guest('unsent@x.com', { sent_at: null }), guest('bounced@x.com', { bounced_at: 't' })] })
    expect((await resolveDateChangeAudience(db, 'e1')).map(r => r.email)).toEqual(['sent@x.com'])
  })

  it('adds members who RSVP\'d in the app but are not on the guest list, without a token', async () => {
    const db = makeDb({
      event_invites: [guest('a@x.com')],
      rsvps: [{ user_id: 'u1', status: 'going' }],
      profiles: [{ id: 'u1', email: 'Member@X.com', display_name: 'Mem' }]
    })
    const out = await resolveDateChangeAudience(db, 'e1')
    expect(out[1]).toEqual({ email: 'member@x.com', name: 'Mem', inviteId: null, token: null, rsvp: 'going' })
  })

  it('tells a person on both lists once, as a guest (that copy has their one-click links)', async () => {
    const db = makeDb({
      event_invites: [guest('both@x.com', { rsvp: 'going' })],
      rsvps: [{ user_id: 'u1', status: 'going' }],
      profiles: [{ id: 'u1', email: 'Both@x.com', display_name: 'Both' }]
    })
    const out = await resolveDateChangeAudience(db, 'e1')
    expect(out).toHaveLength(1)
    expect(out[0]!.token).toBe('tok-both@x.com')
  })

  it('surfaces a failed lookup instead of emailing a partial audience', async () => {
    await expect(resolveDateChangeAudience(makeDb({}, 'event_invites'), 'e1')).rejects.toMatchObject({ message: 'event_invites failed' })
    await expect(resolveDateChangeAudience(makeDb({ rsvps: [{ user_id: 'u1', status: 'going' }] }, 'profiles'), 'e1')).rejects.toMatchObject({ message: 'profiles failed' })
  })
})

describe('summarizeDateChangeAudience', () => {
  const person = (rsvp: 'going' | 'maybe' | 'no' | null, name: string | null = null) => ({ email: 'x@x.com', name, inviteId: null, token: null, rsvp })

  it('counts people by where their RSVP stands', () => {
    const summary = summarizeDateChangeAudience([person('going'), person('going'), person('maybe'), person('no'), person(null), person(null)])
    expect(summary).toMatchObject({ total: 6, going: 2, maybe: 1, declined: 1, noReply: 2 })
  })

  it('previews as a named guest who is going, when there is one', () => {
    expect(summarizeDateChangeAudience([person(null, 'Nel'), person('going'), person('going', 'Gia')]).sample).toEqual({ name: 'Gia', rsvp: 'going' })
    expect(summarizeDateChangeAudience([person(null), person('maybe', 'May')]).sample).toEqual({ name: 'May', rsvp: 'maybe' })
  })

  it('has no sample for an empty audience', () => {
    expect(summarizeDateChangeAudience([])).toMatchObject({ total: 0, sample: null })
  })
})

describe('buildDateChangeMails', () => {
  const base = {
    origin: 'https://x', eventTitle: 'Jaws', oldDate: 'Friday', newDate: 'Saturday', newTime: null, hostName: 'Pat', note: null
  }

  it('gives each guest their own links and the wording for their own reply', () => {
    const [going, declined] = buildDateChangeMails({
      ...base,
      recipients: [
        { email: 'a@x.com', name: 'Ada', inviteId: 'inv-a', token: 'tok-a', rsvp: 'going' },
        { email: 'b@x.com', name: null, inviteId: 'inv-b', token: 'tok-b', rsvp: 'no' }
      ]
    })
    expect(going).toMatchObject({ email: 'a@x.com', inviteId: 'inv-a' })
    expect(going!.html).toContain('https://x/rsvp?token=tok-a&amp;status=no')
    expect(going!.html).toContain('still on the list as going')
    expect(going!.html).not.toContain('tok-b')
    expect(declined!.html).toContain('https://x/rsvp?token=tok-b&amp;status=going')
    expect(declined!.html).toContain('original date')
  })

  it('points an app-only member at the app, untied to any guest row', () => {
    const [member] = buildDateChangeMails({ ...base, recipients: [{ email: 'm@x.com', name: 'Mem', inviteId: null, token: null, rsvp: 'going' }] })
    expect(member!.inviteId).toBeNull()
    expect(member!.html).toContain('https://x/overview')
    expect(member!.html).not.toContain('/rsvp?token=')
  })
})
