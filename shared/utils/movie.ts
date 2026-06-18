import type { TmdbMovie } from '#shared/types/movie'

/** A movie's release year (the YYYY prefix of release_date), or '' if unknown. */
export function movieYear(movie: Pick<TmdbMovie, 'release_date'>): string {
  return movie.release_date?.slice(0, 4) ?? ''
}
