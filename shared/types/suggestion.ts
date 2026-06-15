import type { DocumentReference, Timestamp } from 'firebase/firestore'
import type { TmdbMovie } from './movie'
import type { AppUser } from './user'

export interface SuggestionVote {
  userId: string
  userReference?: DocumentReference
}

/**
 * A movie suggestion within an event. `votesCount` MUST stay consistent with
 * `votes` (Product Invariant 3). `user` is hydrated client-side from
 * `userReference` and is not stored on the document.
 */
export interface Suggestion {
  id: string
  suggestedItem: TmdbMovie
  userReference: DocumentReference
  userEmail?: string
  createdAt?: Timestamp | null
  deleted: boolean
  votesCount: number
  votes: SuggestionVote[]
  user?: AppUser | null
}
