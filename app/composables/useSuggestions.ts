import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  increment,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where
} from 'firebase/firestore'
import { useCollection } from 'vuefire'
import type { MaybeRefOrGetter } from 'vue'
import type { Suggestion } from '#shared/types/suggestion'
import type { TmdbMovie } from '#shared/types/movie'

/**
 * Realtime suggestions for an event + the write actions. Vote actions keep
 * `votesCount` consistent with `votes[]` and guard against double-voting
 * (Product Invariant 3).
 */
export function useSuggestions(eventId: MaybeRefOrGetter<string | null | undefined>) {
  const { $firestore, $firebaseAuth } = useNuxtApp()

  const source = computed(() => {
    const id = toValue(eventId)
    if (!id) return null
    return query(
      collection($firestore, 'events', id, 'suggestions'),
      where('deleted', '==', false),
      orderBy('votesCount', 'desc'),
      orderBy('createdAt', 'asc')
    )
  })

  // maxRefDepth: 0 keeps userReference as a plain ref (we only need its `.id`).
  const suggestions = useCollection<Suggestion>(source, { maxRefDepth: 0 })

  function suggestionsCollection(id: string) {
    return collection($firestore, 'events', id, 'suggestions')
  }

  function alreadySuggested(movieId: number): boolean {
    return suggestions.value.some(s => s.suggestedItem?.id === movieId)
  }

  async function suggest(movie: TmdbMovie): Promise<void> {
    const id = toValue(eventId)
    const user = $firebaseAuth.currentUser
    if (!id || !user) return
    await addDoc(suggestionsCollection(id), {
      createdAt: serverTimestamp(),
      userReference: doc($firestore, 'users', user.uid),
      userEmail: user.email ?? '',
      deleted: false,
      suggestedItem: movie,
      votesCount: 0,
      votes: []
    })
  }

  async function vote(suggestion: Suggestion): Promise<void> {
    const id = toValue(eventId)
    const user = $firebaseAuth.currentUser
    if (!id || !user) return
    // Guard: one vote per user per suggestion, keep votesCount in lockstep.
    if (suggestion.votes?.some(v => v.userId === user.uid)) return
    await updateDoc(doc(suggestionsCollection(id), suggestion.id), {
      votesCount: increment(1),
      votes: arrayUnion({ userId: user.uid, userReference: doc($firestore, 'users', user.uid) })
    })
  }

  async function unvote(suggestion: Suggestion): Promise<void> {
    const id = toValue(eventId)
    const user = $firebaseAuth.currentUser
    if (!id || !user) return
    if (!suggestion.votes?.some(v => v.userId === user.uid)) return
    await updateDoc(doc(suggestionsCollection(id), suggestion.id), {
      votesCount: increment(-1),
      votes: arrayRemove({ userId: user.uid, userReference: doc($firestore, 'users', user.uid) })
    })
  }

  async function removeSuggestion(suggestion: Suggestion): Promise<void> {
    const id = toValue(eventId)
    if (!id) return
    await deleteDoc(doc(suggestionsCollection(id), suggestion.id))
  }

  return { suggestions, alreadySuggested, suggest, vote, unvote, removeSuggestion }
}
