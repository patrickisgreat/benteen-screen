import type { TmdbMovie } from '#shared/types/movie'

interface TmdbSearchResponse {
  results: Array<TmdbMovie & Record<string, unknown>>
}

/**
 * Proxies a TMDB movie search. The API key lives only on the server
 * (`runtimeConfig.tmdbApiKey`) and is never shipped to the browser
 * (Product Invariant 2). Returns a trimmed, predictable subset so the client
 * never has to defend against TMDB's full, sometimes-missing payload.
 */
export default defineEventHandler(async (event): Promise<TmdbMovie[]> => {
  const q = (getQuery(event).q ?? '').toString().trim().slice(0, 200)
  if (!q) return []

  const { tmdbApiKey } = useRuntimeConfig(event)
  if (!tmdbApiKey) {
    throw createError({ statusCode: 500, statusMessage: 'TMDB API key is not configured' })
  }

  let data: TmdbSearchResponse
  try {
    data = await $fetch<TmdbSearchResponse>('https://api.themoviedb.org/3/search/movie', {
      query: {
        api_key: tmdbApiKey,
        query: q,
        include_adult: false,
        language: 'en-US',
        page: 1
      }
    })
  } catch {
    throw createError({ statusCode: 502, statusMessage: 'Failed to reach the movie database' })
  }

  return (data.results ?? [])
    .filter(movie => Boolean(movie?.id && movie?.title))
    .slice(0, 12)
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
