import { describe, expect, it } from 'vitest'
import type { InviteOptions } from '../shared/types/invite-options'
import {
  buildAdminReminderDigestEmail,
  buildAnnounceEmail,
  buildEventInviteEmail,
  buildEventReminderEmail,
  buildInviteEmail,
  escapeHtml,
  formatEmailDate,
  htmlToText,
  sanitizeEmailHtml,
  uniqueEmails
} from '../shared/utils/email'

describe('buildEventReminderEmail', () => {
  it('includes the tokenized one-click RSVP links', () => {
    const m = buildEventReminderEmail({ eventTitle: 'Jaws', eventDate: 'Friday', daysLeft: 3, rsvpUrl: 'https://x/rsvp?token=abc' })
    expect(m.html).toContain('https://x/rsvp?token=abc&amp;status=going')
    expect(m.text).toContain('https://x/rsvp?token=abc&status=no')
  })

  it('uses "in N days" copy and a normal subject when there is time', () => {
    const m = buildEventReminderEmail({ eventTitle: 'Jaws', eventDate: null, daysLeft: 3, rsvpUrl: 'https://x/rsvp?token=abc' })
    expect(m.subject).toBe('Reminder: RSVP for Jaws')
    expect(m.text).toContain('in 3 days')
  })

  it('switches to "Last call" + "tomorrow" at one day out', () => {
    const m = buildEventReminderEmail({ eventTitle: 'Jaws', eventDate: null, daysLeft: 1, rsvpUrl: 'https://x/rsvp?token=abc' })
    expect(m.subject).toBe('Last call: RSVP for Jaws')
    expect(m.text).toContain('tomorrow')
  })
})

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

  const opts = (over: Partial<InviteOptions>): InviteOptions => ({
    theme: 'marquee', accent: 'green', message: '', showPoster: true, showDetails: true, ...over
  })

  it('includes the poster when showPoster is on, showing the whole image (not cropped)', () => {
    const m = buildEventInviteEmail({ eventTitle: 'Jaws', eventDate: null, posterUrl: 'https://img/jaws.jpg', inviterName: null, rsvpUrl: 'https://x/rsvp?token=abc', options: opts({}) })
    expect(m.html).toContain('https://img/jaws.jpg')
    // Whole poster, scaled to width — not object-fit:cover (which cropped top/bottom).
    expect(m.html).toContain('height:auto')
    expect(m.html).not.toContain('object-fit')
  })

  it('omits the poster when showPoster is off', () => {
    const m = buildEventInviteEmail({ eventTitle: 'Jaws', eventDate: null, posterUrl: 'https://img/jaws.jpg', inviterName: null, rsvpUrl: 'https://x/rsvp?token=abc', options: opts({ showPoster: false }) })
    expect(m.html).not.toContain('https://img/jaws.jpg')
  })

  it('renders the host message, escaped', () => {
    const m = buildEventInviteEmail({ eventTitle: 'Jaws', eventDate: null, inviterName: null, rsvpUrl: 'https://x/rsvp?token=abc', options: opts({ message: 'Bring chairs <3' }) })
    expect(m.html).toContain('Bring chairs &lt;3')
    expect(m.text).toContain('Bring chairs <3')
  })

  it('hides date/location details when showDetails is off', () => {
    const m = buildEventInviteEmail({ eventTitle: 'Jaws', eventDate: 'Friday', location: 'The Green', inviterName: null, rsvpUrl: 'https://x/rsvp?token=abc', options: opts({ showDetails: false }) })
    expect(m.html).not.toContain('The Green')
    expect(m.html).not.toContain('Friday')
  })

  it('links the location when a map url is given', () => {
    const m = buildEventInviteEmail({ eventTitle: 'Jaws', eventDate: null, location: 'The Green', locationUrl: 'https://maps/x', inviterName: null, rsvpUrl: 'https://x/rsvp?token=abc', options: opts({}) })
    expect(m.html).toContain('https://maps/x')
  })

  it('applies the chosen accent color to the going button', () => {
    const green = buildEventInviteEmail({ eventTitle: 'Jaws', eventDate: null, inviterName: null, rsvpUrl: 'https://x/rsvp?token=abc', options: opts({ accent: 'green' }) })
    const red = buildEventInviteEmail({ eventTitle: 'Jaws', eventDate: null, inviterName: null, rsvpUrl: 'https://x/rsvp?token=abc', options: opts({ accent: 'red' }) })
    expect(green.html).toContain('#16a34a')
    expect(red.html).toContain('#dc2626')
  })

  it('strips description HTML to plain text (no injection)', () => {
    const m = buildEventInviteEmail({ eventTitle: 'Jaws', eventDate: null, description: '<p>Bring snacks</p><script>alert(1)</script>', inviterName: null, rsvpUrl: 'https://x/rsvp?token=abc', options: opts({}) })
    expect(m.html).toContain('Bring snacks')
    expect(m.html).not.toContain('<script>')
  })

  it('adds the lineup CTA when an app url is given', () => {
    const m = buildEventInviteEmail({ eventTitle: 'Jaws', eventDate: null, inviterName: null, rsvpUrl: 'https://x/rsvp?token=abc', appUrl: 'https://x/overview', options: opts({}) })
    expect(m.html).toContain('https://x/overview')
    expect(m.text).toContain('https://x/overview')
  })
})

describe('buildAdminReminderDigestEmail', () => {
  const items = [
    { eventTitle: 'Jaws', eventDate: 'Friday, July 17, 2026', daysLeft: 3, remindedCount: 4 },
    { eventTitle: 'The Thing', eventDate: null, daysLeft: 1, remindedCount: 1 }
  ]

  it('summarizes the run in the subject with correct pluralization', () => {
    const m = buildAdminReminderDigestEmail({ items, totalReminded: 5, adminUrl: 'https://x/admin' })
    expect(m.subject).toBe('Movie night reminders sent — 5 people nudged')
  })

  it('says "person" (singular) when exactly one was nudged', () => {
    const single = [{ eventTitle: 'Jaws', eventDate: null, daysLeft: 2, remindedCount: 1 }]
    const m = buildAdminReminderDigestEmail({ items: single, totalReminded: 1, adminUrl: 'https://x/admin' })
    expect(m.subject).toBe('Movie night reminders sent — 1 person nudged')
  })

  it('lists each event, its count, and how far out it is', () => {
    const m = buildAdminReminderDigestEmail({ items, totalReminded: 5, adminUrl: 'https://x/admin' })
    expect(m.html).toContain('Jaws')
    expect(m.html).toContain('reminded 4 people (in 3 days)')
    expect(m.html).toContain('reminded 1 person (tomorrow)')
    expect(m.text).toContain('- Jaws (Friday, July 17, 2026) — reminded 4 (in 3 days)')
    expect(m.text).toContain('- The Thing — reminded 1 (tomorrow)')
  })

  it('links to the admin dashboard', () => {
    const m = buildAdminReminderDigestEmail({ items, totalReminded: 5, adminUrl: 'https://x/admin' })
    expect(m.html).toContain('https://x/admin')
    expect(m.text).toContain('https://x/admin')
  })

  it('escapes an event title so a crafted title cannot inject HTML', () => {
    const m = buildAdminReminderDigestEmail({
      items: [{ eventTitle: '<script>alert(1)</script>', eventDate: null, daysLeft: 0, remindedCount: 2 }],
      totalReminded: 2,
      adminUrl: 'https://x/admin'
    })
    expect(m.html).not.toContain('<script>')
    expect(m.html).toContain('&lt;script&gt;')
  })

  it('says "today" for a same-day event', () => {
    const m = buildAdminReminderDigestEmail({
      items: [{ eventTitle: 'Alien', eventDate: null, daysLeft: 0, remindedCount: 2 }],
      totalReminded: 2,
      adminUrl: 'https://x/admin'
    })
    expect(m.html).toContain('(today)')
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

  it('buildAnnounceEmail preserves the editor\'s rich formatting', () => {
    const message = '<p>Two things:</p><ul><li><strong>Vote</strong> for the movie</li><li>Check the <em>bring list</em></li></ul>'
    const m = buildAnnounceEmail({ eventTitle: 'Movie', eventDate: null, message, link: 'https://x/overview' })
    expect(m.html).toContain('<ul><li><strong>Vote</strong> for the movie</li>')
    expect(m.html).toContain('<em>bring list</em>')
    // The plain-text alternative strips the markup but keeps the content.
    expect(m.text).toContain('Vote for the movie')
    expect(m.text).not.toContain('<li>')
  })

  it('buildAnnounceEmail still renders plain-text messages with line breaks', () => {
    const m = buildAnnounceEmail({ eventTitle: 'Movie', eventDate: null, message: 'Doors at 7\nFirst film at 7:30', link: 'l' })
    expect(m.html).toContain('Doors at 7<br>First film at 7:30')
  })

  it('buildAnnounceEmail honors a custom subject', () => {
    const m = buildAnnounceEmail({ eventTitle: 'Movie', eventDate: null, message: 'hi', link: 'l', subject: 'Reminder!' })
    expect(m.subject).toBe('Reminder!')
  })

  it('sanitizeEmailHtml keeps only exact attribute-less editor tags', () => {
    expect(sanitizeEmailHtml('<p>hi</p><h2>head</h2>')).toBe('<p>hi</p><h2>head</h2>')
    // A tag with any attribute is not the exact literal form — it stays escaped.
    expect(sanitizeEmailHtml('<p onclick="x()">hi</p>')).toBe('&lt;p onclick=&quot;x()&quot;&gt;hi</p>')
    expect(sanitizeEmailHtml('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(sanitizeEmailHtml('<a href="https://evil">x</a>')).not.toContain('<a')
  })

  it('uniqueEmails lowercases, trims, and de-duplicates', () => {
    expect(uniqueEmails([' A@x.com ', 'a@x.com', null, 'b@x.com', undefined, ''])).toEqual(['a@x.com', 'b@x.com'])
  })

  it('formatEmailDate renders a readable date and tolerates junk', () => {
    expect(formatEmailDate('2026-07-15T19:00:00Z')).toContain('2026')
    expect(formatEmailDate('not-a-date')).toBe('')
  })

  it('htmlToText strips tags and decodes entities', () => {
    expect(htmlToText('<p>Hello</p><p>World &amp; co</p>')).toBe('Hello\nWorld & co')
    expect(htmlToText('a<br>b')).toBe('a\nb')
  })
})
