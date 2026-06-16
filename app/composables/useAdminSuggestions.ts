import type { MaybeRefOrGetter } from 'vue'
import type { RealtimeChannel } from '@supabase/supabase-js'
import type { Database } from '~/types/database.types'
import type { AdminSuggestion } from '#shared/types/suggestion'

const SELECT = `
  id, event_id, user_id, tmdb_movie, deleted, created_at,
  author:profiles!suggestions_user_id_fkey(display_name, email),
  votes(user_id, voter:profiles!votes_user_id_fkey(display_name))
`

/**
 * Admin view of an event's suggestions — includes soft-deleted rows, and joins
 * the author + each voter's display name. Realtime keeps it live.
 */
export function useAdminSuggestions(eventId: MaybeRefOrGetter<string | null | undefined>) {
  const supabase = useSupabaseClient<Database>()
  const rows = ref<AdminSuggestion[]>([])

  async function refresh(): Promise<void> {
    const id = toValue(eventId)
    if (!id) {
      rows.value = []
      return
    }
    const { data } = await supabase
      .from('suggestions')
      .select(SELECT)
      .eq('event_id', id)
    rows.value = (data ?? []) as unknown as AdminSuggestion[]
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
      .channel(`admin-suggestions-${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'suggestions', filter: `event_id=eq.${id}` }, () => refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'votes' }, () => refresh())
      .subscribe()
  }, { immediate: true })
  onUnmounted(() => {
    if (channel) supabase.removeChannel(channel)
  })

  // Most-voted first for display.
  const suggestions = computed(() =>
    [...rows.value].sort((a, b) => (b.votes?.length ?? 0) - (a.votes?.length ?? 0))
  )

  async function setDeleted(id: string, deleted: boolean): Promise<void> {
    const { error } = await supabase.from('suggestions').update({ deleted }).eq('id', id)
    if (error) throw error
    await refresh()
  }

  function voterNames(suggestion: AdminSuggestion): string[] {
    return (suggestion.votes ?? []).map(vote => vote.voter?.display_name ?? 'Unknown')
  }

  return { suggestions, setDeleted, voterNames }
}
