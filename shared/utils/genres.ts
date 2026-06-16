/** A curated TMDB movie genre used by the "find me a movie" category filters. */
export interface MovieGenre {
  id: number
  label: string
}

/** TMDB genre ids — https://developer.themoviedb.org/reference/genre-movie-list */
export const MOVIE_GENRES: readonly MovieGenre[] = [
  { id: 28, label: 'Action' },
  { id: 12, label: 'Adventure' },
  { id: 16, label: 'Animation' },
  { id: 35, label: 'Comedy' },
  { id: 80, label: 'Crime' },
  { id: 99, label: 'Documentary' },
  { id: 18, label: 'Drama' },
  { id: 14, label: 'Fantasy' },
  { id: 27, label: 'Horror' },
  { id: 9648, label: 'Mystery' },
  { id: 10749, label: 'Romance' },
  { id: 878, label: 'Sci-Fi' },
  { id: 53, label: 'Thriller' }
]

const GENRE_IDS = new Set(MOVIE_GENRES.map(g => g.id))

/** True when `id` is one of our supported genre ids (validates the discover param). */
export function isMovieGenreId(id: number): boolean {
  return GENRE_IDS.has(id)
}
