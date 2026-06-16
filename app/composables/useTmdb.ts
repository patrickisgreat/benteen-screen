import type { TmdbMovie } from '#shared/types/movie'

/** Client access to the server-side TMDB proxy (see server/api/movies). */
export function useTmdb() {
  async function searchMovies(query: string): Promise<TmdbMovie[]> {
    const q = query.trim()
    if (!q) return []
    return await $fetch<TmdbMovie[]>('/api/movies/search', { query: { q } })
  }

  /** Build a TMDB poster URL, or null when the movie has no poster. */
  function posterUrl(posterPath: string | null | undefined, size: 'w185' | 'w500' = 'w500'): string | null {
    return posterPath ? `https://image.tmdb.org/t/p/${size}${posterPath}` : null
  }

  /** Best YouTube trailer for a movie (key + title), or null key when none. */
  async function getTrailer(movieId: number): Promise<{ key: string | null, name: string | null }> {
    return await $fetch('/api/movies/videos', { query: { id: movieId } })
  }

  /** A fresh handful of critically acclaimed, lesser-known movies ("hidden gems"). */
  async function discoverGems(): Promise<TmdbMovie[]> {
    return await $fetch<TmdbMovie[]>('/api/movies/discover')
  }

  return { searchMovies, posterUrl, getTrailer, discoverGems }
}
