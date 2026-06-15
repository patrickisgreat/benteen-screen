import { collection, doc, orderBy, query, updateDoc } from 'firebase/firestore'
import { useCollection } from 'vuefire'
import type { MaybeRefOrGetter } from 'vue'
import type { TmdbMovie } from '#shared/types/movie'

/** A user reference that VueFire has resolved into the referenced user document. */
interface ResolvedUser {
  id?: string
  uid?: string
  displayName?: string
  email?: string
  photoURL?: string
}

export interface AdminSuggestion {
  id: string
  suggestedItem: TmdbMovie
  userEmail?: string
  userReference?: ResolvedUser
  deleted: boolean
  votesCount: number
  votes: Array<{ userId: string, userReference?: ResolvedUser }>
}

/**
 * Admin view of an event's suggestions — includes soft-deleted ones, and relies
 * on VueFire's default reference resolution to hydrate the suggester and voters
 * reactively. This replaces the legacy hand-rolled onSnapshot + un-awaited
 * forEach that raced and dropped voter/email data.
 */
export function useAdminSuggestions(eventId: MaybeRefOrGetter<string | null | undefined>) {
  const { $firestore } = useNuxtApp()

  const source = computed(() => {
    const id = toValue(eventId)
    if (!id) return null
    return query(
      collection($firestore, 'events', id, 'suggestions'),
      orderBy('votesCount', 'desc')
    )
  })

  const suggestions = useCollection<AdminSuggestion>(source)

  async function setDeleted(suggestionId: string, deleted: boolean): Promise<void> {
    const id = toValue(eventId)
    if (!id) return
    await updateDoc(doc($firestore, 'events', id, 'suggestions', suggestionId), { deleted })
  }

  function voterNames(suggestion: AdminSuggestion): string[] {
    return (suggestion.votes ?? []).map(vote => vote.userReference?.displayName ?? 'Unknown')
  }

  return { suggestions, setDeleted, voterNames }
}
