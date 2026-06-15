import { addDoc, collection, deleteDoc, doc, updateDoc } from 'firebase/firestore'

export interface EventInput {
  title: string
  description: string
  date: Date
}

/** Admin write actions for events. Firestore stores the JS Date as a Timestamp. */
export function useEventAdmin() {
  const { $firestore } = useNuxtApp()

  async function createEvent(input: EventInput): Promise<void> {
    await addDoc(collection($firestore, 'events'), {
      title: input.title,
      description: input.description,
      timestamp: input.date
    })
  }

  async function updateEvent(id: string, input: EventInput): Promise<void> {
    await updateDoc(doc($firestore, 'events', id), {
      title: input.title,
      description: input.description,
      timestamp: input.date
    })
  }

  async function deleteEvent(id: string): Promise<void> {
    await deleteDoc(doc($firestore, 'events', id))
  }

  return { createEvent, updateEvent, deleteEvent }
}
