import type { Database } from '~/types/database.types'

export interface EventInput {
  title: string
  description: string
  date: Date
}

/** Admin write actions for events. */
export function useEventAdmin() {
  const supabase = useSupabaseClient<Database>()
  const user = useSupabaseUser()

  async function createEvent(input: EventInput): Promise<void> {
    const { error } = await supabase.from('events').insert({
      title: input.title,
      description: input.description,
      event_date: input.date.toISOString(),
      created_by: user.value?.id ?? null
    })
    if (error) throw error
  }

  async function updateEvent(id: string, input: EventInput): Promise<void> {
    const { error } = await supabase.from('events').update({
      title: input.title,
      description: input.description,
      event_date: input.date.toISOString()
    }).eq('id', id)
    if (error) throw error
  }

  async function deleteEvent(id: string): Promise<void> {
    const { error } = await supabase.from('events').delete().eq('id', id)
    if (error) throw error
  }

  return { createEvent, updateEvent, deleteEvent }
}
