import { describe, expect, it } from 'vitest'
import { movieYear } from '../shared/utils/movie'

describe('movieYear', () => {
  it('returns the YYYY prefix of release_date', () => {
    expect(movieYear({ release_date: '1995-12-15' })).toBe('1995')
  })

  it('returns an empty string when release_date is missing or blank', () => {
    expect(movieYear({ release_date: '' })).toBe('')
    expect(movieYear({ release_date: undefined })).toBe('')
    expect(movieYear({})).toBe('')
  })
})
