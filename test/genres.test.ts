import { describe, expect, it } from 'vitest'
import { MOVIE_GENRES, isMovieGenreId } from '../shared/utils/genres'

describe('isMovieGenreId', () => {
  it('accepts every id in the curated list', () => {
    for (const g of MOVIE_GENRES) {
      expect(isMovieGenreId(g.id)).toBe(true)
    }
  })

  it('rejects ids outside the list', () => {
    expect(isMovieGenreId(0)).toBe(false)
    expect(isMovieGenreId(99999)).toBe(false)
    expect(isMovieGenreId(-1)).toBe(false)
  })

  it('exposes a non-empty, labelled list', () => {
    expect(MOVIE_GENRES.length).toBeGreaterThan(0)
    expect(MOVIE_GENRES.every(g => g.label.length > 0)).toBe(true)
  })
})
