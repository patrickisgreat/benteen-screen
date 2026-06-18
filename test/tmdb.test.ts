import { describe, expect, it } from 'vitest'
import { isUsableTmdbMovie, normalizeTmdbMovie, toTmdbMovies } from '../server/utils/tmdb'

describe('isUsableTmdbMovie', () => {
  it('keeps rows that have both an id and a title', () => {
    expect(isUsableTmdbMovie({ id: 1, title: 'Heat' })).toBe(true)
  })

  it('rejects rows missing an id or a title', () => {
    expect(isUsableTmdbMovie({ id: 1 })).toBe(false)
    expect(isUsableTmdbMovie({ title: 'Heat' })).toBe(false)
    expect(isUsableTmdbMovie({ id: 0, title: 'Heat' })).toBe(false)
    expect(isUsableTmdbMovie({ id: 1, title: '' })).toBe(false)
    expect(isUsableTmdbMovie(null)).toBe(false)
    expect(isUsableTmdbMovie(undefined)).toBe(false)
  })
})

describe('normalizeTmdbMovie', () => {
  it('keeps the trimmed subset of fields', () => {
    expect(normalizeTmdbMovie({
      id: 42,
      title: 'Brazil',
      overview: 'A bureaucrat in a retro-future world.',
      poster_path: '/poster.jpg',
      release_date: '1985-02-20',
      vote_average: 7.9,
      popularity: 12.3,
      adult: false,
      backdrop_path: '/ignored.jpg'
    })).toEqual({
      id: 42,
      title: 'Brazil',
      overview: 'A bureaucrat in a retro-future world.',
      poster_path: '/poster.jpg',
      release_date: '1985-02-20',
      vote_average: 7.9,
      popularity: 12.3
    })
  })

  it('fills the fields TMDB sometimes omits with safe defaults', () => {
    expect(normalizeTmdbMovie({ id: 7, title: 'Stalker' })).toEqual({
      id: 7,
      title: 'Stalker',
      overview: '',
      poster_path: null,
      release_date: '',
      vote_average: 0,
      popularity: 0
    })
  })
})

describe('toTmdbMovies', () => {
  it('drops unusable rows and normalizes the rest, preserving order', () => {
    const result = toTmdbMovies([
      { id: 1, title: 'First' },
      { id: 2 }, // unusable — no title
      { title: 'No id' }, // unusable — no id
      { id: 3, title: 'Third', overview: 'x' }
    ])
    expect(result.map(m => m.id)).toEqual([1, 3])
    expect(result[0]?.overview).toBe('')
    expect(result[1]?.overview).toBe('x')
  })

  it('returns an empty array for missing results', () => {
    expect(toTmdbMovies(undefined)).toEqual([])
    expect(toTmdbMovies([])).toEqual([])
  })
})
