import type { H3Event } from 'h3'
import type { TmdbMovie } from '#shared/types/movie'

// TMDB-facing helpers shared by the movie proxy routes (search/discover/videos).
// The API key lives only on the server (`runtimeConfig.tmdbApiKey`) and is never
// shipped to the browser (Product Invariant 2).

const TMDB_BASE_URL = 'https://api.themoviedb.org/3'

/** A raw TMDB result row — the trimmed fields we read plus whatever else TMDB sends. */
type RawTmdbMovie = Partial<TmdbMovie> & Record<string, unknown>

/**
 * Fetches from TMDB with the server-only API key. Throws a 500 when the key is
 * missing and maps any upstream failure to a 502, so every movie route surfaces
 * identical, predictable errors instead of re-implementing the guard.
 */
export async function tmdbFetch<T>(
  event: H3Event,
  path: string,
  query: Record<string, string | number | boolean> = {}
): Promise<T> {
  const { tmdbApiKey } = useRuntimeConfig(event)
  if (!tmdbApiKey) {
    throw createError({ statusCode: 500, statusMessage: 'TMDB API key is not configured' })
  }

  try {
    // `$fetch<T>` widens to `TypedInternalResponse`, which TS can't narrow to a
    // generic `T`; the cast pins the external-API payload to the caller's shape.
    return await $fetch<T>(`${TMDB_BASE_URL}${path}`, {
      query: { api_key: tmdbApiKey, language: 'en-US', ...query }
    }) as T
  } catch (error) {
    console.error('TMDB request failed:', error)
    throw createError({ statusCode: 502, statusMessage: 'Failed to reach the movie database' })
  }
}

/** A TMDB row is usable only if it has the two fields the client always needs. */
export function isUsableTmdbMovie(movie: RawTmdbMovie | null | undefined): boolean {
  return Boolean(movie?.id && movie?.title)
}

/**
 * Trims a raw TMDB row to the predictable subset the client consumes, filling
 * the fields TMDB sometimes omits so the UI never has to defend against them.
 */
export function normalizeTmdbMovie(movie: RawTmdbMovie): TmdbMovie {
  return {
    id: movie.id as number,
    title: movie.title as string,
    overview: movie.overview ?? '',
    poster_path: movie.poster_path ?? null,
    release_date: movie.release_date ?? '',
    vote_average: movie.vote_average ?? 0,
    popularity: movie.popularity ?? 0
  }
}

/** Filters out unusable rows and normalizes the rest. Order-preserving. */
export function toTmdbMovies(results: RawTmdbMovie[] | undefined): TmdbMovie[] {
  return (results ?? []).filter(isUsableTmdbMovie).map(normalizeTmdbMovie)
}
