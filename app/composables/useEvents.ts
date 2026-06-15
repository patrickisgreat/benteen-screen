import { collection, orderBy, query } from 'firebase/firestore'
import { useCollection } from 'vuefire'
import type { MovieEvent } from '#shared/types/event'

/** Reactive, realtime list of all movie-night events, ordered chronologically. */
export function useEvents() {
  const { $firestore } = useNuxtApp()
  const source = query(collection($firestore, 'events'), orderBy('timestamp'))
  const events = useCollection<MovieEvent>(source, { maxRefDepth: 0 })
  return { events }
}
