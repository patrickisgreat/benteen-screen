import type { Database } from '~/types/database.types'

/** Admin-tunable app settings (single row). Reading is open; writing is gated to
 *  admins by RLS — this composable is only used behind the admin page. */
export function useAppSettings() {
  const supabase = useSupabaseClient<Database>()
  const maxInvites = ref<number | null>(null)
  // Per-event participation caps (null = use the defaults in shared/utils/limits).
  const maxSuggestions = ref<number | null>(null)
  const maxVotes = ref<number | null>(null)
  const pending = ref(true)

  async function refresh(): Promise<void> {
    const { data } = await supabase
      .from('app_settings')
      .select('max_invites, max_suggestions, max_votes')
      .eq('id', true)
      .maybeSingle()
    maxInvites.value = data?.max_invites ?? null
    maxSuggestions.value = data?.max_suggestions ?? null
    maxVotes.value = data?.max_votes ?? null
    pending.value = false
  }

  onMounted(refresh)

  async function update(patch: Record<string, number | null>): Promise<void> {
    const { error } = await supabase
      .from('app_settings')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', true)
    if (error) throw error
  }

  /** Set the total invite cap (null = unlimited). RLS enforces admin-only. */
  async function setMaxInvites(value: number | null): Promise<void> {
    await update({ max_invites: value })
    maxInvites.value = value
  }

  /** Set the per-event suggestion cap (null = default). RLS enforces admin-only. */
  async function setMaxSuggestions(value: number | null): Promise<void> {
    await update({ max_suggestions: value })
    maxSuggestions.value = value
  }

  /** Set the per-event vote cap (null = default). RLS enforces admin-only. */
  async function setMaxVotes(value: number | null): Promise<void> {
    await update({ max_votes: value })
    maxVotes.value = value
  }

  return { maxInvites, maxSuggestions, maxVotes, pending, setMaxInvites, setMaxSuggestions, setMaxVotes }
}
