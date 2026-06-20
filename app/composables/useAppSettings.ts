import type { Database } from '~/types/database.types'

/** Admin-tunable app settings (single row). Reading is open; writing is gated to
 *  admins by RLS — this composable is only used behind the admin page. */
export function useAppSettings() {
  const supabase = useSupabaseClient<Database>()
  const maxInvites = ref<number | null>(null)
  const pending = ref(true)

  async function refresh(): Promise<void> {
    const { data } = await supabase.from('app_settings').select('max_invites').eq('id', true).maybeSingle()
    maxInvites.value = data?.max_invites ?? null
    pending.value = false
  }

  onMounted(refresh)

  /** Set the total invite cap (null = unlimited). RLS enforces admin-only. */
  async function setMaxInvites(value: number | null): Promise<void> {
    const { error } = await supabase
      .from('app_settings')
      .update({ max_invites: value, updated_at: new Date().toISOString() })
      .eq('id', true)
    if (error) throw error
    maxInvites.value = value
  }

  return { maxInvites, pending, setMaxInvites }
}
