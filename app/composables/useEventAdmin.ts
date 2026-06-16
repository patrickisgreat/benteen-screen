import type { Database } from '~/types/database.types'

export interface EventInput {
  title: string
  description: string
  date: Date
  startTime?: string | null
  location?: string | null
  locationUrl?: string | null
  posterUrl?: string | null
}

/** Map the form's `EventInput` onto the event-table column shape. */
function toRow(input: EventInput) {
  return {
    title: input.title,
    description: input.description,
    event_date: input.date.toISOString(),
    start_time: input.startTime?.trim() || null,
    location: input.location?.trim() || null,
    location_url: input.locationUrl?.trim() || null,
    poster_url: input.posterUrl?.trim() || null
  }
}

/** Admin write actions for events. */
export function useEventAdmin() {
  const supabase = useSupabaseClient<Database>()
  const user = useSupabaseUser()

  async function createEvent(input: EventInput): Promise<void> {
    const { error } = await supabase.from('events').insert({
      ...toRow(input),
      created_by: user.value?.id ?? null
    })
    if (error) throw error
  }

  async function updateEvent(id: string, input: EventInput): Promise<void> {
    const { error } = await supabase.from('events').update(toRow(input)).eq('id', id)
    if (error) throw error
  }

  async function deleteEvent(id: string): Promise<void> {
    const { error } = await supabase.from('events').delete().eq('id', id)
    if (error) throw error
  }

  /** Upload a poster image to the public `event-posters` bucket; returns its public URL. */
  async function uploadPoster(file: File): Promise<string> {
    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
    const path = `${crypto.randomUUID()}.${ext}`
    const { error } = await supabase.storage.from('event-posters').upload(path, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type || undefined
    })
    if (error) throw error
    const { data } = supabase.storage.from('event-posters').getPublicUrl(path)
    return data.publicUrl
  }

  return { createEvent, updateEvent, deleteEvent, uploadPoster }
}
