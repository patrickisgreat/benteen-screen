import { pickBestTrailer, type TmdbVideo } from '#shared/utils/trailer'

/**
 * Returns the best YouTube trailer key for a TMDB movie. Server-side so the
 * TMDB key stays off the client (Product Invariant 2).
 */
export default defineEventHandler(async (event): Promise<{ key: string | null, name: string | null }> => {
  const id = Number(getQuery(event).id)
  if (!Number.isInteger(id) || id <= 0) return { key: null, name: null }

  const { tmdbApiKey } = useRuntimeConfig(event)
  if (!tmdbApiKey) {
    throw createError({ statusCode: 500, statusMessage: 'TMDB API key is not configured' })
  }

  let data: { results?: TmdbVideo[] }
  try {
    data = await $fetch(`https://api.themoviedb.org/3/movie/${id}/videos`, {
      query: { api_key: tmdbApiKey, language: 'en-US' }
    })
  } catch {
    throw createError({ statusCode: 502, statusMessage: 'Failed to reach the movie database' })
  }

  const pick = pickBestTrailer(data.results)
  return { key: pick?.key ?? null, name: pick?.name ?? null }
})
