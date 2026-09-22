import { describe, expect, it } from 'vitest'
import {
  ANNOUNCE_PRESETS,
  ANNOUNCE_SCOPE_VALUES,
  DEFAULT_ANNOUNCE_PRESET,
  announcePresetMembers,
  announceScopeLabel,
  describeAnnounceSelection,
  isClubWidePreset,
  rsvpLabel,
  type AnnouncePerson
} from '../shared/utils/announce'

const person = (over: Partial<AnnouncePerson> & { email: string }): AnnouncePerson => ({
  name: null, rsvp: null, onGuestList: true, joined: true, onRoster: true, ...over
})

// Grace said yes, Ada said maybe, Alan said no, Hedy hasn't replied. Linus RSVP'd
// in the app without ever being added to the guest list. Newcomer is on the club
// roster, has never signed in, and has nothing to do with this event.
const directory: AnnouncePerson[] = [
  person({ email: 'ada@example.com', name: 'Ada', rsvp: 'maybe' }),
  person({ email: 'alan@example.com', name: 'Alan', rsvp: 'no' }),
  person({ email: 'grace@example.com', name: 'Grace', rsvp: 'going' }),
  person({ email: 'hedy@example.com', name: 'Hedy', rsvp: null }),
  person({ email: 'linus@example.com', name: 'Linus', rsvp: 'going', onGuestList: false }),
  person({ email: 'new@example.com', name: 'Newcomer', onGuestList: false, joined: false })
]

const members = (id: Parameters<typeof announcePresetMembers>[1]) =>
  announcePresetMembers(directory, id).sort()

describe('announce presets', () => {
  it('starts a blast on the people who said they are coming', () => {
    expect(DEFAULT_ANNOUNCE_PRESET).toBe('going')
    expect(members('going')).toEqual(['grace@example.com', 'linus@example.com'])
  })

  it('counts a yes however it arrived — e-vite or in the app', () => {
    // Linus never got an e-vite; he clicked going in the app. He is still going.
    expect(members('going')).toContain('linus@example.com')
  })

  it('adds the maybes without the refusals', () => {
    expect(members('going_maybe')).toEqual(['ada@example.com', 'grace@example.com', 'linus@example.com'])
  })

  it('chases only the guests who were invited and stayed silent', () => {
    // Newcomer has said nothing either, but was never invited to this event.
    expect(members('no_reply')).toEqual(['hedy@example.com'])
  })

  it('covers the whole guest list however people replied', () => {
    expect(members('guests')).toEqual([
      'ada@example.com', 'alan@example.com', 'grace@example.com', 'hedy@example.com'
    ])
  })

  it('reaches past the event only for the club-wide groups', () => {
    expect(members('members')).toContain('linus@example.com')
    expect(members('members')).not.toContain('new@example.com')
    expect(members('invited')).toContain('new@example.com')
  })

  it('puts the event\'s own groups before the club-wide ones', () => {
    // The buttons render in this order; the whole-club blast is never first.
    const clubWide = ANNOUNCE_PRESETS.map(p => isClubWidePreset(p.id))
    expect(clubWide).toEqual([false, false, false, false, true, true])
  })

  it('keeps the scope values already written to the comms log', () => {
    for (const value of ['going', 'members', 'invited']) {
      expect(ANNOUNCE_SCOPE_VALUES).toContain(value)
    }
  })
})

describe('describeAnnounceSelection', () => {
  it('names a selection that matches a group exactly', () => {
    expect(describeAnnounceSelection(directory, members('going'))).toBe('going')
    expect(describeAnnounceSelection(directory, members('guests'))).toBe('guests')
  })

  it('calls a hand-edited list what it is', () => {
    expect(describeAnnounceSelection(directory, ['grace@example.com'])).toBe('custom')
  })

  it('does not call a superset of a group by that group\'s name', () => {
    expect(describeAnnounceSelection(directory, [...members('going'), 'alan@example.com'])).toBe('custom')
  })

  it('refuses to name an empty selection', () => {
    expect(describeAnnounceSelection(directory, [])).toBe('custom')
  })

  it('prefers the narrower group when two cover the same people', () => {
    // Everyone on this guest list happens to be going — that is still "Going".
    const allGoing = [person({ email: 'grace@example.com', rsvp: 'going' })]
    expect(describeAnnounceSelection(allGoing, ['grace@example.com'])).toBe('going')
  })
})

describe('announceScopeLabel', () => {
  it('labels a group and a hand-picked list', () => {
    expect(announceScopeLabel('going')).toBe('Going')
    expect(announceScopeLabel('custom')).toBe('Hand-picked')
  })

  it('falls back to the raw value for a group it no longer knows', () => {
    expect(announceScopeLabel('some_retired_scope')).toBe('some_retired_scope')
  })
})

describe('rsvpLabel', () => {
  it('reads every reply, including silence', () => {
    expect(rsvpLabel('going')).toBe('Going')
    expect(rsvpLabel('maybe')).toBe('Maybe')
    expect(rsvpLabel('no')).toBe('Can\'t make it')
    expect(rsvpLabel(null)).toBe('No reply')
  })
})
