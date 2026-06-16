import { describe, expect, it } from 'vitest'
import {
  buildAnnounceEmail,
  buildEventInviteEmail,
  buildInviteEmail,
  escapeHtml,
  formatEmailDate,
  uniqueEmails
} from '../server/utils/email'

describe('buildEventInviteEmail', () => {
  it('includes tokenized Going/Maybe/No RSVP links', () => {
    const m = buildEventInviteEmail({
      eventTitle: 'Jaws',
      eventDate: 'Friday',
      location: 'The Green',
      inviterName: 'Sam',
      rsvpUrl: 'https://x/rsvp?token=abc'
    })
    expect(m.subject).toContain('Jaws')
    expect(m.html).toContain('https://x/rsvp?token=abc&amp;status=going')
    expect(m.html).toContain('status=maybe')
    expect(m.html).toContain('status=no')
    expect(m.text).toContain('token=abc&status=going')
  })

  it('falls back to "Your host" without an inviter name', () => {
    const m = buildEventInviteEmail({ eventTitle: 'Jaws', eventDate: null, location: null, inviterName: null, rsvpUrl: 'https://x/rsvp?token=abc' })
    expect(m.html).toContain('Your host')
  })
})

describe('email utils', () => {
  it('escapeHtml neutralizes angle brackets and quotes', () => {
    expect(escapeHtml(`<script>"x"&'`)).toBe('&lt;script&gt;&quot;x&quot;&amp;&#39;')
  })

  it('buildInviteEmail names the inviter and links to sign in', () => {
    const m = buildInviteEmail({ inviterName: 'Sam', link: 'https://x/login', eventTitle: 'Jaws', eventDate: 'Friday' })
    expect(m.subject).toContain('Sam')
    expect(m.html).toContain('https://x/login')
    expect(m.html).toContain('Jaws')
    expect(m.text).toContain('https://x/login')
  })

  it('buildInviteEmail falls back to "A member" without an inviter name', () => {
    const m = buildInviteEmail({ inviterName: null, link: 'https://x/login' })
    expect(m.subject).toContain('A member')
  })

  it('buildAnnounceEmail escapes the admin message (no HTML injection)', () => {
    const m = buildAnnounceEmail({ eventTitle: 'Movie', eventDate: null, message: '<img src=x onerror=alert(1)>', link: 'https://x/overview' })
    expect(m.html).not.toContain('<img')
    expect(m.html).toContain('&lt;img')
  })

  it('buildAnnounceEmail honors a custom subject', () => {
    const m = buildAnnounceEmail({ eventTitle: 'Movie', eventDate: null, message: 'hi', link: 'l', subject: 'Reminder!' })
    expect(m.subject).toBe('Reminder!')
  })

  it('uniqueEmails lowercases, trims, and de-duplicates', () => {
    expect(uniqueEmails([' A@x.com ', 'a@x.com', null, 'b@x.com', undefined, ''])).toEqual(['a@x.com', 'b@x.com'])
  })

  it('formatEmailDate renders a readable date and tolerates junk', () => {
    expect(formatEmailDate('2026-07-15T19:00:00Z')).toContain('2026')
    expect(formatEmailDate('not-a-date')).toBe('')
  })
})
