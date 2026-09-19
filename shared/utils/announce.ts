/**
 * Who an announcement blast goes to. The scopes split in two: the first four are
 * scoped to one event's guest list (`event_invites` + in-app RSVPs), the last two
 * reach the whole club regardless of the event. Shared so the composer, the
 * server resolver, and the comms log all name the same audiences.
 */
export const ANNOUNCE_SCOPES = [
  {
    value: 'guests',
    label: 'This event\'s guest list',
    hint: 'Everyone invited to this event'
  },
  {
    value: 'going',
    label: 'Going',
    hint: 'Said yes — by e-vite or in the app'
  },
  {
    value: 'going_maybe',
    label: 'Going or maybe',
    hint: 'Anyone who hasn\'t ruled it out'
  },
  {
    value: 'no_reply',
    label: 'Haven\'t replied',
    hint: 'On the guest list, still silent'
  },
  {
    value: 'members',
    label: 'Every member (club-wide)',
    hint: 'Everyone who has signed in — not just this event'
  },
  {
    value: 'invited',
    label: 'Everyone on the roster (club-wide)',
    hint: 'The whole allowlist, joined or not'
  }
] as const

export type AnnounceScope = (typeof ANNOUNCE_SCOPES)[number]['value']

/** Scope values as a tuple, for `z.enum` on the server. */
export const ANNOUNCE_SCOPE_VALUES = ANNOUNCE_SCOPES.map(s => s.value) as unknown as
  readonly [AnnounceScope, ...AnnounceScope[]]

/** The event-scoped audiences — the ones that only reach this event's people. */
export const EVENT_ANNOUNCE_SCOPES: readonly AnnounceScope[] = ['guests', 'going', 'going_maybe', 'no_reply']

/** True when the scope reaches the whole club, not just this event's guests. */
export function isClubWideScope(scope: string): boolean {
  return scope === 'members' || scope === 'invited'
}

/**
 * Human label for a stored scope. Falls back to the raw value so historical log
 * rows written before a scope was renamed still read as something.
 */
export function announceScopeLabel(scope: string): string {
  return ANNOUNCE_SCOPES.find(s => s.value === scope)?.label ?? scope
}

/** One person a blast can go to, with the name the admin knows them by. */
export interface AnnounceRecipient {
  email: string
  name: string | null
}
