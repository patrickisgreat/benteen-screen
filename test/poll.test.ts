import { describe, expect, it } from 'vitest'
import { parsePollRequest } from '../shared/utils/poll'

describe('parsePollRequest', () => {
  it('accepts a question with two to six choices, trimmed and in order', () => {
    const r = parsePollRequest({ question: '  Move to Saturday? ', options: [' Yes ', 'No'] })
    expect(r).toEqual({ ok: true, value: { question: 'Move to Saturday?', options: ['Yes', 'No'], note: null } })
  })

  it('keeps an optional note and treats a blank one as none', () => {
    expect(parsePollRequest({ question: 'Q', options: ['a', 'b'], note: ' Rain is forecast ' })).toMatchObject({ value: { note: 'Rain is forecast' } })
    expect(parsePollRequest({ question: 'Q', options: ['a', 'b'], note: '   ' })).toMatchObject({ value: { note: null } })
  })

  it('rejects a poll without a real choice to make', () => {
    expect(parsePollRequest({ question: 'Q', options: ['only one'] }).ok).toBe(false)
    expect(parsePollRequest({ question: 'Q', options: ['a', '  '] }).ok).toBe(false)
    expect(parsePollRequest({ question: '   ', options: ['a', 'b'] }).ok).toBe(false)
  })

  it('rejects more choices than fit in an email', () => {
    expect(parsePollRequest({ question: 'Q', options: ['1', '2', '3', '4', '5', '6', '7'] }).ok).toBe(false)
  })

  it('rejects two choices that read the same, ignoring case', () => {
    expect(parsePollRequest({ question: 'Q', options: ['Saturday', 'saturday'] })).toEqual({ ok: false, error: 'Each choice must be different' })
  })

  it('rejects a malformed body', () => {
    expect(parsePollRequest(null).ok).toBe(false)
    expect(parsePollRequest({ question: 'Q', options: 'a,b' }).ok).toBe(false)
  })
})
