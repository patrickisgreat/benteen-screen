import { describe, expect, it } from 'vitest'
import { DEFAULT_TEXT_TEMPLATE, buildSmsHref, firstName, renderTextTemplate } from '../shared/utils/sms'

const vars = { name: 'Sam', event: 'The Goonies', date: 'Fri, Oct 17', link: 'https://bsotg.app/rsvp?token=abc' }

describe('renderTextTemplate', () => {
  it('fills every placeholder, including repeats', () => {
    expect(renderTextTemplate('Hi {name}, {event} on {date}: {link} ({name}!)', vars))
      .toBe('Hi Sam, The Goonies on Fri, Oct 17: https://bsotg.app/rsvp?token=abc (Sam!)')
  })

  it('leaves unknown braces alone', () => {
    expect(renderTextTemplate('{name} {wat} {', vars)).toBe('Sam {wat} {')
  })

  it('the default template reads as a complete invitation', () => {
    const text = renderTextTemplate(DEFAULT_TEXT_TEMPLATE, vars)
    expect(text).toContain('Hey Sam!')
    expect(text).toContain('The Goonies')
    expect(text).toContain('Fri, Oct 17')
    expect(text).toContain(vars.link)
    expect(text).not.toContain('{')
  })
})

describe('firstName', () => {
  it('uses the first word of a display name', () => {
    expect(firstName('Sam Bennett', 'sam@x.com')).toBe('Sam')
    expect(firstName('  Sam ', 'sam@x.com')).toBe('Sam')
  })

  it('falls back to the email handle when there is no name', () => {
    expect(firstName(null, 'sam.b@x.com')).toBe('sam.b')
    expect(firstName('   ', 'sam.b@x.com')).toBe('sam.b')
  })
})

describe('buildSmsHref', () => {
  it('addresses one recipient with a URL-encoded body that iOS and Android both read', () => {
    expect(buildSmsHref(['+15551234567'], 'Hey Sam! RSVP: https://x.y/rsvp?token=a&b'))
      .toBe('sms:+15551234567?&body=Hey%20Sam!%20RSVP%3A%20https%3A%2F%2Fx.y%2Frsvp%3Ftoken%3Da%26b')
  })

  it('comma-joins several recipients into a group text', () => {
    expect(buildSmsHref(['+15551234567', '+15557654321'], 'hi')).toBe('sms:+15551234567,+15557654321?&body=hi')
  })
})
