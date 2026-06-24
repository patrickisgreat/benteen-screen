import { describe, expect, it } from 'vitest'
import type { InviteOptions } from '../shared/types/invite-options'
import {
  buildAnnounceEmail,
  buildEventInviteEmail,
  buildInviteEmail,
  escapeHtml,
  formatEmailDate,
  htmlToText,
  uniqueEmails
} from '../shared/utils/email'

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

  it('htmlToText strips tags and decodes entities', () => {
    expect(htmlToText('<p>Hello</p><p>World &amp; co</p>')).toBe('Hello\nWorld & co')
    expect(htmlToText('a<br>b')).toBe('a\nb')
  })
})
