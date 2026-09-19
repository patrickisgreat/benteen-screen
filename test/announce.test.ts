import { describe, expect, it } from 'vitest'
import {
  ANNOUNCE_SCOPES,
  ANNOUNCE_SCOPE_VALUES,
  EVENT_ANNOUNCE_SCOPES,
  announceScopeLabel,
  isClubWideScope
} from '../shared/utils/announce'

describe('announce scopes', () => {
  it('offers the event-scoped audiences before the club-wide ones', () => {
    // The composer renders them in order; the safe, event-scoped options come
    // first so the whole-club blast is never the nearest thing to the cursor.
    const firstFour = ANNOUNCE_SCOPES.slice(0, 4).map(s => s.value)
    expect(firstFour).toEqual([...EVENT_ANNOUNCE_SCOPES])
    expect(ANNOUNCE_SCOPES.slice(4).every(s => isClubWideScope(s.value))).toBe(true)
  })

  it('keeps the scope values that already exist in the comms log', () => {
    // Renaming one would orphan historical log rows.
    expect(ANNOUNCE_SCOPE_VALUES).toContain('members')
    expect(ANNOUNCE_SCOPE_VALUES).toContain('going')
    expect(ANNOUNCE_SCOPE_VALUES).toContain('invited')
  })

  it('treats only the roster-wide audiences as club-wide', () => {
    expect(isClubWideScope('members')).toBe(true)
    expect(isClubWideScope('invited')).toBe(true)
    expect(isClubWideScope('guests')).toBe(false)
    expect(isClubWideScope('going')).toBe(false)
  })

  it('labels a scope for the log', () => {
    expect(announceScopeLabel('going')).toBe('Going')
    expect(announceScopeLabel('no_reply')).toBe('Haven\'t replied')
  })

  it('falls back to the raw value for a scope it no longer knows', () => {
    expect(announceScopeLabel('some_retired_scope')).toBe('some_retired_scope')
  })
})
