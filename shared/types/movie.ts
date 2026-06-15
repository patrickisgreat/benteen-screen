/**
 * A movie as returned by TMDB and stored on a suggestion's `suggestedItem`.
 * Keys are kept in TMDB's native snake_case for backward compatibility with
 * existing Firestore documents. Fields TMDB sometimes omits are optional —
 * render them defensively (see Product Invariant 5 / Security in CLAUDE.md).
 */
export interface TmdbMovie {
  id: number
  title: string
  overview?: string
  poster_path?: string | null
  release_date?: string
  vote_average?: number
  popularity?: number
}
