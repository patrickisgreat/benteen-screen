import type { Database } from '~/types/database.types'
import type { GuestCandidate } from '#shared/utils/guestDirectory'

interface UseGuestDirectory {
  candidates: Ref<GuestCandidate[]>
  pending: Ref<boolean>
  /** Why the directory couldn't load (null when fine) — the picker shows it
   *  instead of pretending nobody matches. */
  error: Ref<string | null>
}

/**
 * Admin-only directory of everyone who could be added to a guest list: members,
 * the club roster, and past events' guests, merged + deduped by email. Loaded
 * once on mount (the club is small; someone who joins mid-session shows up on the
 * next page load) and searched client-side via `searchGuestCandidates`. Reads run
 * under RLS — every table here has an admin read policy.
 */
export function useGuestDirectory(): UseGuestDirectory {
  const supabase = useSupabaseClient<Database>()
  const candidates = ref<GuestCandidate[]>([])
  const pending = ref(true)
  const error = ref<string | null>(null)

  async function load(): Promise<void> {
    pending.value = true
    const [members, roster, pastGuests] = await Promise.all([
      supabase.from('profiles').select('email, display_name'),
      supabase.from('invites').select('email, display_name'),
      supabase.from('event_invites').select('email, display_name')
    ])
    // Surface a failed source instead of quietly searching a partial directory.
    error.value = (members.error ?? roster.error ?? pastGuests.error)?.message ?? null
    candidates.value = mergeGuestCandidates(members.data ?? [], roster.data ?? [], pastGuests.data ?? [])
    pending.value = false
  }

  onMounted(load)

  return { candidates, pending, error }
}
