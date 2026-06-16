import type { MaybeRefOrGetter } from 'vue'
import type { Database } from '~/types/database.types'
import type { InviteOptions } from '#shared/types/invite-options'

/** Save an event's e-vite customization. Admin-only writes are enforced by the
 *  `events: admin update` RLS policy. */
export function useInviteOptions(eventId: MaybeRefOrGetter<string | null>) {
  const supabase = useSupabaseClient<Database>()

  async function save(options: InviteOptions): Promise<void> {
    const id = toValue(eventId)
    if (!id) return
    const { error } = await supabase.from('events').update({ invite_options: { ...options } }).eq('id', id)
    if (error) throw error
  }

  return { save }
}
