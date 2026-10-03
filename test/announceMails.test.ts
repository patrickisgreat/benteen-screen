import { describe, expect, it } from 'vitest'
import { buildAnnounceMails } from '../server/utils/announceMails'

const base = {
  recipients: [{ email: 'sam@x.com', name: 'Sam Jones' }, { email: 'member@x.com', name: null }],
  guests: [{ id: 'inv-sam', email: 'sam@x.com', token: 'tok-sam' }],
  origin: 'https://x',
  eventTitle: 'Jaws',
  eventDate: 'Friday',
  message: '<p>Did this reach you?</p>',
  subject: 'Movie night'
}

describe('buildAnnounceMails', () => {
  it('builds one copy per recipient, greeted by name and tied to their guest row', () => {
    const mails = buildAnnounceMails({ ...base, scope: 'guests' })
    expect(mails.map(m => [m.email, m.inviteId])).toEqual([['sam@x.com', 'inv-sam'], ['member@x.com', null]])
    expect(mails[0]!.html).toContain('Hi Sam,')
    expect(mails[1]!.html).not.toContain('Hi ')
    expect(mails[0]!.subject).toBe('Movie night')
  })

  it('gives the unopened audience each guest\'s own one-click RSVP buttons', () => {
    const [sam] = buildAnnounceMails({ ...base, scope: 'unopened' })
    expect(sam!.html).toContain('https://x/rsvp?token=tok-sam&amp;status=going')
    expect(sam!.text).toContain('https://x/rsvp?token=tok-sam&status=no')
  })

  it('never puts RSVP buttons on an announcement to any other audience', () => {
    for (const scope of ['guests', 'going', 'custom', 'members', 'invited'] as const) {
      const [sam] = buildAnnounceMails({ ...base, scope })
      expect(sam!.html).not.toContain('/rsvp?token=')
      expect(sam!.html).toContain('View on Benteen Screen')
    }
  })

  it('falls back to the app button for a recipient with no guest row', () => {
    const mails = buildAnnounceMails({ ...base, scope: 'unopened' })
    expect(mails[1]!.html).not.toContain('/rsvp?token=')
    expect(mails[1]!.html).toContain('https://x/overview')
  })
})
