import type { Database } from '~/types/database.types'

/** Admin-tunable app settings (single row). Reading is open; writing is gated to
 *  admins by RLS — this composable is only used behind the admin page. */
export function useAppSettings() {
  const supabase = useSupabaseClient<Database>()
  const maxInvites = ref<number | null>(null)
  // Per-event participation caps (null = use the defaults in shared/utils/limits).
  const maxSuggestions = ref<number | null>(null)
  const maxVotes = ref<number | null>(null)
  // RSVP-reminder checkpoints: days-before-event to nudge non-responders ([] = off).
  const reminderDays = ref<number[]>([])
  const pending = ref(true)

  async function refresh(): Promise<void> {
    const { data } = await supabase
      .from('app_settings')
      .select('max_invites, max_suggestions, max_votes, reminder_days')
      .eq('id', true)
      .maybeSingle()
    maxInvites.value = data?.max_invites ?? null
    maxSuggestions.value = data?.max_suggestions ?? null
    maxVotes.value = data?.max_votes ?? null
    reminderDays.value = data?.reminder_days ?? []
    pending.value = false
  }

  onMounted(refresh)

  async function update(patch: Database['public']['Tables']['app_settings']['Update']): Promise<void> {
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

  /** Set both per-event caps in ONE write (null = the limits.ts defaults). RLS
   *  enforces admin-only. Atomic, so a partial failure can't leave one cap
   *  committed and the other not. */
  async function setParticipationCaps(suggestions: number | null, votes: number | null): Promise<void> {
    await update({ max_suggestions: suggestions, max_votes: votes })
    maxSuggestions.value = suggestions
    maxVotes.value = votes
  }

  /** Set the RSVP-reminder checkpoints (days before the event; [] = off). RLS
   *  enforces admin-only. */
  async function setReminderDays(days: number[]): Promise<void> {
    await update({ reminder_days: days })
    reminderDays.value = days
  }

  return { maxInvites, maxSuggestions, maxVotes, reminderDays, pending, setMaxInvites, setParticipationCaps, setReminderDays }
}
