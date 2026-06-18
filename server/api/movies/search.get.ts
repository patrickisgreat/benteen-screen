import type { TmdbMovie } from '#shared/types/movie'

interface TmdbSearchResponse {
  results: Array<TmdbMovie & Record<string, unknown>>
}

const MAX_SEARCH_RESULTS = 12

/**
 * Proxies a TMDB movie search. The API key lives only on the server
 * (`runtimeConfig.tmdbApiKey`) and is never shipped to the browser
 * (Product Invariant 2). Returns a trimmed, predictable subset so the client
 * never has to defend against TMDB's full, sometimes-missing payload.
 */
export default defineEventHandler(async (event): Promise<TmdbMovie[]> => {
  const q = (getQuery(event).q ?? '').toString().trim().slice(0, 200)
  if (!q) return []

  const data = await tmdbFetch<TmdbSearchResponse>(event, '/search/movie', {
    query: q,
    include_adult: false,
    page: 1
  })

  return toTmdbMovies(data.results).slice(0, MAX_SEARCH_RESULTS)
})
