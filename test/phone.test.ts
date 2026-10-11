import { describe, expect, it } from 'vitest'
import { formatPhone, normalizePhone } from '../shared/utils/phone'

describe('normalizePhone', () => {
  it('turns a US number in any common spelling into E.164', () => {
    expect(normalizePhone('(555) 123-4567')).toBe('+15551234567')
    expect(normalizePhone('555.123.4567')).toBe('+15551234567')
    expect(normalizePhone(' 5551234567 ')).toBe('+15551234567')
    expect(normalizePhone('1-555-123-4567')).toBe('+15551234567')
  })

  it('keeps an international number as dialed', () => {
    expect(normalizePhone('+44 20 7946 0958')).toBe('+442079460958')
    expect(normalizePhone('+1 (555) 123-4567')).toBe('+15551234567')
  })

  it('rejects input that cannot be a dialable number', () => {
    expect(normalizePhone('')).toBeNull()
    expect(normalizePhone('   ')).toBeNull()
    expect(normalizePhone('555-1234')).toBeNull() // too short to be a US number
    expect(normalizePhone('25551234567')).toBeNull() // 11 digits not starting with 1
    expect(normalizePhone('+0 123 456 789')).toBeNull() // no country code starts with 0
    expect(normalizePhone('+1234')).toBeNull()
    expect(normalizePhone('call me')).toBeNull()
  })
})

describe('formatPhone', () => {
  it('pretty-prints a US number', () => {
    expect(formatPhone('+15551234567')).toBe('(555) 123-4567')
  })

  it('leaves other numbers as stored', () => {
    expect(formatPhone('+442079460958')).toBe('+442079460958')
  })
})
