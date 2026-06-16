import type { MaybeRefOrGetter } from 'vue'
import type { RealtimeChannel } from '@supabase/supabase-js'
import type { Database } from '~/types/database.types'
import type { BringItem } from '#shared/types/bring'

const SELECT = 'id, event_id, label, note, user_id, created_by, bringer:profiles!bring_items_user_id_fkey(display_name)'

/** Potluck "bring list" for an event: items + add/claim/unclaim/remove (realtime). */
export function useBringList(eventId: MaybeRefOrGetter<string | null | undefined>) {
  const supabase = useSupabaseClient<Database>()
  const myId = useState<string | null>('my-id', () => null)
  const items = ref<BringItem[]>([])

  async function refresh(): Promise<void> {
    const id = toValue(eventId)
    if (!id) {
      items.value = []
      return
    }
    const { data } = await supabase.from('bring_items').select(SELECT).eq('event_id', id).order('created_at')
    items.value = (data ?? []) as unknown as BringItem[]
  }

  let channel: RealtimeChannel | null = null
  watch(() => toValue(eventId), (id) => {
    if (channel) {
      supabase.removeChannel(channel)
      channel = null
    }
    refresh()
    if (!id) return
    channel = supabase
      .channel(`bring-${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bring_items', filter: `event_id=eq.${id}` }, () => refresh())
      .subscribe()
  }, { immediate: true })
  onUnmounted(() => {
    if (channel) supabase.removeChannel(channel)
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

  return { items, addItem, claim, unclaim, remove }
}
