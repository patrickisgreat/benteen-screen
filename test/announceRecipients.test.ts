import { describe, expect, it } from 'vitest'
import { loadAnnounceDirectory, selectRecipients } from '../server/utils/announceRecipients'
import type { AnnouncePerson } from '../shared/utils/announce'

type Row = Record<string, unknown>
type Tables = Partial<Record<'event_invites' | 'rsvps' | 'profiles' | 'invites', Row[]>>
type Db = Parameters<typeof loadAnnounceDirectory>[0]

/**
 * A test double for the Supabase client covering only the chains the directory
 * loader uses (`select` / `eq` / `in`), each narrowing rows the way Postgres
 * would — so a filter dropped from the loader shows up as a wrong address book
 * rather than a silently passing stub.
 */
function makeFakeDb(tables: Tables): Db {
  const builder = (rows: Row[]) => ({
    select: () => builder(rows),
    eq: (col: string, value: unknown) => builder(rows.filter(r => r[col] === value)),
    in: (col: string, values: unknown[]) => builder(rows.filter(r => values.includes(r[col]))),
    then: (onFulfilled: (res: { data: Row[], error: null }) => unknown) =>
      Promise.resolve({ data: rows, error: null }).then(onFulfilled)
  })
  // Cast at this test boundary: only the chains stubbed above are ever called.
  return { from: (table: keyof Tables) => builder(tables[table] ?? []) } as unknown as Db
}

const EVENT = 'evt-1'

// Grace is an email-only guest who clicked going in her e-vite. Ada is a member
// on the guest list whose in-app maybe the trigger mirrored onto her row. Linus
// is a member who RSVP'd in the app but was never added to the guest list.
// Hedy is invited and silent. Newcomer is on the roster and has never signed in.
const db = makeFakeDb({
  event_invites: [
    { event_id: EVENT, email: 'grace@example.com', display_name: 'Grace', rsvp: 'going' },
    { event_id: EVENT, email: 'ada@example.com', display_name: 'Ada', rsvp: 'maybe' },
    { event_id: EVENT, email: 'hedy@example.com', display_name: 'Hedy', rsvp: null },
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
    { email: 'grace@example.com', display_name: 'Grace', accepted_at: null },
    { email: 'ada@example.com', display_name: 'Ada', accepted_at: '2026-01-02' },
    { email: 'linus@example.com', display_name: 'Linus', accepted_at: '2026-01-03' },
    { email: 'new@example.com', display_name: 'Newcomer', accepted_at: null }
  ]
})

const find = (people: AnnouncePerson[], email: string) => people.find(p => p.email === email)

describe('loadAnnounceDirectory', () => {
  it('knows the guest list, the in-app RSVPs, and the club roster', async () => {
    const people = await loadAnnounceDirectory(db, EVENT)
    expect(people.map(p => p.email).sort()).toEqual([
      'ada@example.com', 'grace@example.com', 'hedy@example.com', 'linus@example.com', 'new@example.com'
    ])
  })

  it('leaves another event\'s guests and replies out of it', async () => {
    const people = await loadAnnounceDirectory(db, EVENT)
    expect(find(people, 'someone-else@example.com')).toBeUndefined()
    expect(find(people, 'other@example.com')).toBeUndefined()
  })

  it('carries each guest\'s reply to this event', async () => {
    const people = await loadAnnounceDirectory(db, EVENT)
    expect(find(people, 'grace@example.com')?.rsvp).toBe('going')
    expect(find(people, 'hedy@example.com')?.rsvp).toBeNull()
  })

  it('takes a reply from the app when there is no e-vite to carry it', async () => {
    const people = await loadAnnounceDirectory(db, EVENT)
    expect(find(people, 'linus@example.com')).toMatchObject({ rsvp: 'going', onGuestList: false })
  })

  it('marks who is on this event\'s guest list', async () => {
    const people = await loadAnnounceDirectory(db, EVENT)
    expect(find(people, 'hedy@example.com')?.onGuestList).toBe(true)
    expect(find(people, 'new@example.com')?.onGuestList).toBe(false)
  })

  it('separates being on the roster from having signed in', async () => {
    const people = await loadAnnounceDirectory(db, EVENT)
    // Grace is an email-only guest: on the roster, never signed in.
    expect(find(people, 'grace@example.com')).toMatchObject({ onRoster: true, joined: false })
    expect(find(people, 'ada@example.com')).toMatchObject({ onRoster: true, joined: true })
  })

  it('lists someone once whatever the casing of their address', async () => {
    const people = await loadAnnounceDirectory(db, EVENT)
    expect(people.filter(p => p.email === 'ada@example.com')).toHaveLength(1)
    expect(people.map(p => p.email)).not.toContain('ADA@example.com')
  })

  it('keeps the name the host gave a guest over the one on the roster', async () => {
    const people = await loadAnnounceDirectory(db, EVENT)
    expect(find(people, 'ada@example.com')?.name).toBe('Ada')
  })

  it('orders the address book by name', async () => {
    const people = await loadAnnounceDirectory(db, EVENT)
    expect(people.map(p => p.name)).toEqual(['Ada', 'Grace', 'Hedy', 'Linus', 'Newcomer'])
  })

  it('is empty for an event nobody is attached to', async () => {
    expect(await loadAnnounceDirectory(makeFakeDb({}), EVENT)).toEqual([])
  })
})

const directory: AnnouncePerson[] = [
  { email: 'ada@example.com', name: 'Ada', rsvp: 'going', onGuestList: true, joined: true, onRoster: true },
  { email: 'grace@example.com', name: 'Grace', rsvp: 'no', onGuestList: true, joined: false, onRoster: true }
]

describe('selectRecipients', () => {
  it('mails exactly the addresses that were ticked', () => {
    expect(selectRecipients(directory, ['grace@example.com'])).toEqual([directory[1]])
  })

  it('matches a ticked address regardless of casing or stray spaces', () => {
    expect(selectRecipients(directory, [' Grace@Example.com '])).toEqual([directory[1]])
  })

  it('drops an address the club does not know instead of mailing it', () => {
    expect(selectRecipients(directory, ['stranger@example.com'])).toEqual([])
  })

  it('mails nobody when nothing was ticked', () => {
    expect(selectRecipients(directory, [])).toEqual([])
  })
})
