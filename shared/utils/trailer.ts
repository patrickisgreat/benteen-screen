export interface TmdbVideo {
  key: string
  site: string
  type: string
  official: boolean
  name: string
}

/**
 * Pick the best YouTube trailer from TMDB's videos list, in priority order:
 * official Trailer › any Trailer › Teaser › first YouTube video. Non-YouTube
 * videos are ignored. Returns null when there's nothing playable.
 */
export function pickBestTrailer(videos: readonly TmdbVideo[] | null | undefined): TmdbVideo | null {
  const youtube = (videos ?? []).filter(v => v.site === 'YouTube')
  return youtube.find(v => v.type === 'Trailer' && v.official)
    ?? youtube.find(v => v.type === 'Trailer')
    ?? youtube.find(v => v.type === 'Teaser')
    ?? youtube[0]
    ?? null
}
