import { pickBestTrailer, type TmdbVideo } from '#shared/utils/trailer'

/**
 * Returns the best YouTube trailer key for a TMDB movie. Server-side so the
 * TMDB key stays off the client (Product Invariant 2).
 */
export default defineEventHandler(async (event): Promise<{ key: string | null, name: string | null }> => {
  const id = Number(getQuery(event).id)
  if (!Number.isInteger(id) || id <= 0) return { key: null, name: null }

  const data = await tmdbFetch<{ results?: TmdbVideo[] }>(event, `/movie/${id}/videos`)

  const pick = pickBestTrailer(data.results)
  return { key: pick?.key ?? null, name: pick?.name ?? null }
})
