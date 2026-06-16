import type { TmdbMovie } from '#shared/types/movie'

interface TmdbDiscoverResponse {
  results: Array<TmdbMovie & Record<string, unknown>>
}

// "Hidden gems": highly rated, but with a modest vote count so blockbusters
// are filtered out. A random early page keeps each visit fresh.
const VOTE_AVERAGE_MIN = 7
const VOTE_COUNT_MIN = 300 // enough ratings to be credible
const VOTE_COUNT_MAX = 4000 // but not a household name
const MAX_PAGE = 15
const RETURN_COUNT = 8

function shuffle<T>(items: T[]): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j]!, out[i]!]
  }
  return out
}

/**
 * Proxies TMDB Discover for critically acclaimed, lesser-known movies.
 * The API key stays server-side (Product Invariant 2). Returns a shuffled,
 * trimmed subset so each call surfaces a different handful of gems.
 */
export default defineEventHandler(async (event): Promise<TmdbMovie[]> => {
  const { tmdbApiKey } = useRuntimeConfig(event)
  if (!tmdbApiKey) {
    throw createError({ statusCode: 500, statusMessage: 'TMDB API key is not configured' })
  }

  const page = Math.floor(Math.random() * MAX_PAGE) + 1

  let data: TmdbDiscoverResponse
  try {
    data = await $fetch<TmdbDiscoverResponse>('https://api.themoviedb.org/3/discover/movie', {
      query: {
        'api_key': tmdbApiKey,
        'include_adult': false,
        'language': 'en-US',
        'sort_by': 'vote_average.desc',
        'vote_average.gte': VOTE_AVERAGE_MIN,
        'vote_count.gte': VOTE_COUNT_MIN,
        'vote_count.lte': VOTE_COUNT_MAX,
        'page': page
      }
    })
  } catch {
    throw createError({ statusCode: 502, statusMessage: 'Failed to reach the movie database' })
  }

  return shuffle((data.results ?? []).filter(movie => Boolean(movie?.id && movie?.title)))
    .slice(0, RETURN_COUNT)
    .map(movie => ({
      id: movie.id,
      title: movie.title,
      overview: movie.overview ?? '',
      poster_path: movie.poster_path ?? null,
      release_date: movie.release_date ?? '',
      vote_average: movie.vote_average ?? 0,
      popularity: movie.popularity ?? 0
    }))
})
