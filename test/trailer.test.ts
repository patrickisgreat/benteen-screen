import { describe, expect, it } from 'vitest'
import { pickBestTrailer, type TmdbVideo } from '../shared/utils/trailer'

const v = (over: Partial<TmdbVideo>): TmdbVideo => ({
  key: 'k', site: 'YouTube', type: 'Trailer', official: false, name: 'n', ...over
})

describe('pickBestTrailer', () => {
  it('returns null for empty / nullish input', () => {
    expect(pickBestTrailer([])).toBeNull()
    expect(pickBestTrailer(null)).toBeNull()
    expect(pickBestTrailer(undefined)).toBeNull()
  })

  it('ignores non-YouTube videos', () => {
    expect(pickBestTrailer([v({ key: 'vimeo', site: 'Vimeo' })])).toBeNull()
  })

  it('prefers an official Trailer over a non-official one', () => {
    const picked = pickBestTrailer([
      v({ key: 'unofficial', type: 'Trailer', official: false }),
      v({ key: 'official', type: 'Trailer', official: true })
    ])
    expect(picked?.key).toBe('official')
  })

  it('falls back to any Trailer, then Teaser, then first YouTube video', () => {
    expect(pickBestTrailer([v({ key: 'trailer', type: 'Trailer' }), v({ key: 'teaser', type: 'Teaser' })])?.key).toBe('trailer')
    expect(pickBestTrailer([v({ key: 'clip', type: 'Clip' }), v({ key: 'teaser', type: 'Teaser' })])?.key).toBe('teaser')
    expect(pickBestTrailer([v({ key: 'featurette', type: 'Featurette' })])?.key).toBe('featurette')
  })
})
