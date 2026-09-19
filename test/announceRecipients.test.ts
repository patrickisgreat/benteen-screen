import { describe, expect, it } from 'vitest'
import { resolveAnnounceRecipients, selectRecipients } from '../server/utils/announceRecipients'

type Row = Record<string, unknown>
type Tables = Partial<Record<'event_invites' | 'rsvps' | 'profiles' | 'invites', Row[]>>
type Db = Parameters<typeof resolveAnnounceRecipients>[0]

/**
 * A test double for the Supabase client covering only the chains the resolver
 * uses (`select` / `eq` / `in` / `not(col, 'is', null)`), each narrowing the rows
 * the same way Postgres would, so a filter dropped from the resolver shows up as
 * a wrong recipient list rather than a silently passing stub.
 */
function makeFakeDb(tables: Tables): Db {
  const builder = (rows: Row[]) => ({
    select: () => builder(rows),
    eq: (col: string, value: unknown) => builder(rows.filter(r => r[col] === value)),
    in: (col: string, values: unknown[]) => builder(rows.filter(r => values.includes(r[col]))),
    not: (col: string, _op: 'is', _value: null) => builder(rows.filter(r => r[col] != null)),
    then: (onFulfilled: (res: { data: Row[], error: null }) => unknown) =>
      Promise.resolve({ data: rows, error: null }).then(onFulfilled)
  })
  // Cast at this test boundary: only the chains stubbed above are ever called.
  return {
    from: (table: keyof Tables) => builder(tables[table] ?? [])
  } as unknown as Db
}

const EVENT = 'evt-1'

// Grace is a plain-email guest who clicked "going" in her e-vite. Ada is a member
// on the guest list who replied in the app (the trigger mirrored it onto her row).
// Linus is a member who RSVP'd in the app but was never added to the guest list.
// Hedy is on the guest list and has said nothing at all.
const db = makeFakeDb({
  event_invites: [
    { event_id: EVENT, email: 'grace@example.com', display_name: 'Grace', rsvp: 'going' },
    { event_id: EVENT, email: 'ada@example.com', display_name: 'Ada', rsvp: 'maybe' },
    { event_id: EVENT, email: 'hedy@example.com', display_name: 'Hedy', rsvp: null },
    { event_id: EVENT, email: 'alan@example.com', display_name: 'Alan', rsvp: 'no' },
    { event_id: 'evt-2', email: 'someone-else@example.com', display_name: 'Other', rsvp: 'going' }
  ],
  rsvps: [
    { event_id: EVENT, user_id: 'u-ada', status: 'maybe' },
    { event_id: EVENT, user_id: 'u-linus', status: 'going' },
    { event_id: 'evt-2', user_id: 'u-other', status: 'going' }
  ],
  profiles: [
    { id: 'u-ada', email: 'ADA@example.com', display_name: 'Ada Lovelace' },
    { id: 'u-linus', email: 'linus@example.com', display_name: 'Linus' },
    { id: 'u-other', email: 'other@example.com', display_name: 'Other' }
  ],
  invites: [
    { email: 'grace@example.com', display_name: 'Grace', accepted_at: '2026-01-01' },
    { email: 'ada@example.com', display_name: 'Ada', accepted_at: '2026-01-02' },
    { email: 'never-signed-in@example.com', display_name: 'Newcomer', accepted_at: null }
  ]
})

const emailsFor = async (scope: Parameters<typeof resolveAnnounceRecipients>[2]) =>
  (await resolveAnnounceRecipients(db, EVENT, scope)).map(r => r.email)

describe('resolveAnnounceRecipients', () => {
  it('scopes the guest list to one event', async () => {
    const emails = await emailsFor('guests')
    expect(emails).not.toContain('someone-else@example.com')
    expect(emails).toContain('grace@example.com')
  })

  it('counts a member who RSVP\'d in the app but was never added to the guest list', async () => {
    expect(await emailsFor('guests')).toContain('linus@example.com')
  })

  it('collects the going crowd from both the e-vites and the in-app RSVPs', async () => {
    expect((await emailsFor('going')).sort()).toEqual(['grace@example.com', 'linus@example.com'])
  })

  it('leaves out the no-shows and the silent when scoped to going', async () => {
    const emails = await emailsFor('going')
    expect(emails).not.toContain('alan@example.com')
    expect(emails).not.toContain('hedy@example.com')
  })

  it('adds the maybes to the going crowd', async () => {
    expect((await emailsFor('going_maybe')).sort())
      .toEqual(['ada@example.com', 'grace@example.com', 'linus@example.com'])
  })

  it('counts only guest-list silence as no reply', async () => {
    // An in-app RSVP is a reply, so Linus is not "silent" — and he has no e-vite
    // to chase anyway.
    expect(await emailsFor('no_reply')).toEqual(['hedy@example.com'])
  })

  it('never lets an event scope reach the whole roster', async () => {
    expect(await emailsFor('guests')).not.toContain('never-signed-in@example.com')
  })

  it('limits the member blast to people who have actually signed in', async () => {
    expect((await emailsFor('members')).sort()).toEqual(['ada@example.com', 'grace@example.com'])
  })

  it('reaches the whole allowlist, joined or not, when asked to', async () => {
    expect((await emailsFor('invited')).sort())
      .toEqual(['ada@example.com', 'grace@example.com', 'never-signed-in@example.com'])
  })

  it('emails someone once when both sources know them, whatever the casing', async () => {
    const emails = await emailsFor('going_maybe')
    expect(emails.filter(e => e === 'ada@example.com')).toHaveLength(1)
    expect(emails).not.toContain('ADA@example.com')
  })

  it('orders the audience by the name the admin knows', async () => {
    expect(await resolveAnnounceRecipients(db, EVENT, 'going_maybe'))
      .toEqual([
        { email: 'ada@example.com', name: 'Ada' },
        { email: 'grace@example.com', name: 'Grace' },
        { email: 'linus@example.com', name: 'Linus' }
      ])
  })

  it('returns nobody for an event with no guests and no RSVPs', async () => {
    expect(await resolveAnnounceRecipients(makeFakeDb({}), EVENT, 'guests')).toEqual([])
  })
})

const audience = [
  { email: 'ada@example.com', name: 'Ada' },
  { email: 'grace@example.com', name: 'Grace' }
]

describe('selectRecipients', () => {
  it('sends to the whole audience when nothing was unticked', () => {
    expect(selectRecipients(audience, null)).toEqual(audience)
  })

  it('narrows the blast to the ticked addresses', () => {
    expect(selectRecipients(audience, ['grace@example.com'])).toEqual([audience[1]])
  })

  it('matches a ticked address regardless of casing or stray spaces', () => {
    expect(selectRecipients(audience, [' Grace@Example.com '])).toEqual([audience[1]])
  })

  it('drops an address that is not in the scope instead of emailing it', () => {
    expect(selectRecipients(audience, ['stranger@example.com'])).toEqual([])
  })

  it('sends to nobody when everything was unticked', () => {
    expect(selectRecipients(audience, [])).toEqual([])
  })
})
