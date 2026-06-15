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

  return { searchMovies, posterUrl }
}
