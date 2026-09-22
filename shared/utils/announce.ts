import type { RsvpStatus } from '#shared/types/rsvp'

/**
 * Someone a blast could go to, with everything the composer needs to decide
 * whether they should: how they replied to this event, whether they're on its
 * guest list at all, and where they stand with the club.
 */
export interface AnnouncePerson {
  email: string
  name: string | null
  /** Their reply to this event, by e-vite or in the app. */
  rsvp: RsvpStatus | null
  /** On this event's curated guest list. */
  onGuestList: boolean
  /** On the club allowlist and has signed in. */
  joined: boolean
  /** On the club allowlist, joined or not. */
  onRoster: boolean
}

/**
 * The one-click audiences above the recipient list. They are selection
 * shortcuts, not cages: picking one ticks those people, and the admin is free to
 * tick and untick from there — which is why each preset is a predicate over the
 * same directory rather than a query of its own.
 *
 * Order is meaningful twice over: it's the order the buttons appear in (this
 * event's own people first, the club-wide blasts last and labelled as such), and
 * it decides which name a selection gets when two presets resolve to the same
 * people.
 */
export const ANNOUNCE_PRESETS = [
  {
    id: 'going',
    label: 'Going',
    hint: 'Everyone who has RSVP\'d yes to this event',
    includes: (p: AnnouncePerson) => p.rsvp === 'going'
  },
  {
    id: 'going_maybe',
    label: 'Going or maybe',
    hint: 'Anyone who hasn\'t ruled it out',
    includes: (p: AnnouncePerson) => p.rsvp === 'going' || p.rsvp === 'maybe'
  },
  {
    id: 'no_reply',
    label: 'Haven\'t replied',
    hint: 'Invited to this event and still silent',
    includes: (p: AnnouncePerson) => p.onGuestList && p.rsvp === null
  },
  {
    id: 'guests',
    label: 'Whole guest list',
    hint: 'Everyone invited to this event, however they replied',
    includes: (p: AnnouncePerson) => p.onGuestList
  },
  {
    id: 'members',
    label: 'Every member',
    hint: 'Everyone who has signed in — club-wide, not just this event',
    includes: (p: AnnouncePerson) => p.joined
  },
  {
    id: 'invited',
    label: 'Everyone on the roster',
    hint: 'The whole club allowlist, joined or not',
    includes: (p: AnnouncePerson) => p.onRoster
  }
] as const

export type AnnouncePreset = (typeof ANNOUNCE_PRESETS)[number]['id']

/** The audience a fresh composer starts on: the people who said they're coming. */
export const DEFAULT_ANNOUNCE_PRESET: AnnouncePreset = 'going'

/** What a hand-picked audience is called once it stops matching any preset. */
export const CUSTOM_ANNOUNCE_SCOPE = 'custom'

/** Stored in `comms_log.scope`: a preset's id, or `custom` for a hand-picked list. */
export type AnnounceScope = AnnouncePreset | typeof CUSTOM_ANNOUNCE_SCOPE

export const ANNOUNCE_SCOPE_VALUES = [
  ...ANNOUNCE_PRESETS.map(p => p.id),
  CUSTOM_ANNOUNCE_SCOPE
] as unknown as readonly [AnnounceScope, ...AnnounceScope[]]

/** True when the preset reaches the whole club rather than this event's people. */
export function isClubWidePreset(id: string): boolean {
  return id === 'members' || id === 'invited'
}

/** The addresses a preset covers, in the directory's order. */
export function announcePresetMembers(
  people: readonly AnnouncePerson[],
  id: AnnouncePreset
): string[] {
  const preset = ANNOUNCE_PRESETS.find(p => p.id === id)
  if (!preset) return []
  return people.filter(preset.includes).map(p => p.email)
}

/**
 * Name a selection: the first preset covering exactly these people, else
 * `custom`. Lets the comms log say "Going" instead of listing twelve addresses,
 * without trusting the composer to label its own send.
 */
export function describeAnnounceSelection(
  people: readonly AnnouncePerson[],
  selected: readonly string[]
): AnnounceScope {
  const chosen = new Set(selected)
  if (!chosen.size) return CUSTOM_ANNOUNCE_SCOPE
  for (const preset of ANNOUNCE_PRESETS) {
    const members = people.filter(preset.includes).map(p => p.email)
    if (members.length === chosen.size && members.every(email => chosen.has(email))) return preset.id
  }
  return CUSTOM_ANNOUNCE_SCOPE
}

/**
 * Human label for a stored scope. Falls back to the raw value so a log row
 * written before a preset was renamed still reads as something.
 */
export function announceScopeLabel(scope: string): string {
  if (scope === CUSTOM_ANNOUNCE_SCOPE) return 'Hand-picked'
  return ANNOUNCE_PRESETS.find(p => p.id === scope)?.label ?? scope
}

/** How someone's reply reads in the recipient list. */
export function rsvpLabel(rsvp: RsvpStatus | null): string {
  if (rsvp === 'going') return 'Going'
  if (rsvp === 'maybe') return 'Maybe'
  if (rsvp === 'no') return 'Can\'t make it'
  return 'No reply'
}
