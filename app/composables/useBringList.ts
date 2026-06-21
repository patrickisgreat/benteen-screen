import type { MaybeRefOrGetter } from 'vue'
import type { Database } from '~/types/database.types'
import type { BringItem } from '#shared/types/bring'

const SELECT = 'id, event_id, label, note, user_id, created_by, bringer:profiles!bring_items_user_id_fkey(display_name)'

/** Potluck "bring list" for an event: items + add/claim/unclaim/remove (realtime). */
export function useBringList(eventId: MaybeRefOrGetter<string | null | undefined>) {
  const supabase = useSupabaseClient<Database>()
  const myId = useMyId()

  const { data: items, error, refresh } = useRealtimeQuery<BringItem[]>({
    key: eventId,
    channel: 'bring',
    tables: [{ table: 'bring_items' }],
    empty: [],
    errorFallback: 'Failed to load the bring list',
    load: async (id) => {
      const { data, error } = await supabase.from('bring_items').select(SELECT).eq('event_id', id).order('created_at')
      if (error) throw error
      // Supabase types the embedded `bringer` join as an array, but the FK is to a
      // single profile — assert to our `BringItem` (single bringer-or-null) shape.
      return (data ?? []) as unknown as BringItem[]
    }
  })

  // created_by is omitted (DB defaults it to auth.uid()).
  async function addItem(label: string, note?: string, claimSelf = true): Promise<void> {
    const id = toValue(eventId)
    if (!id || !label.trim()) return
    const { error } = await supabase.from('bring_items').insert({
      event_id: id,
      label: label.trim(),
      note: note?.trim() || null,
      user_id: claimSelf ? myId.value : null
    })
    if (error) throw error
    await refresh()
  }

  async function claim(item: BringItem): Promise<void> {
    if (!myId.value) return
    const { error } = await supabase.from('bring_items').update({ user_id: myId.value }).eq('id', item.id)
    if (error) throw error
    await refresh()
  }

  async function unclaim(item: BringItem): Promise<void> {
    const { error } = await supabase.from('bring_items').update({ user_id: null }).eq('id', item.id)
    if (error) throw error
    await refresh()
  }

  async function remove(item: BringItem): Promise<void> {
    const { error } = await supabase.from('bring_items').delete().eq('id', item.id)
    if (error) throw error
    await refresh()
  }

  async function updateItem(item: BringItem, label: string, note?: string): Promise<void> {
    const trimmed = label.trim()
    if (!trimmed) return
    const { error } = await supabase
      .from('bring_items')
      .update({ label: trimmed, note: note?.trim() || null })
      .eq('id', item.id)
    if (error) throw error
    await refresh()
  }

  return { items, error, addItem, claim, unclaim, updateItem, remove }
}
