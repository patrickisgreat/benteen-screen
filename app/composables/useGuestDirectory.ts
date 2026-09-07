import type { Database } from '~/types/database.types'
import type { GuestCandidate } from '#shared/utils/guestDirectory'

interface UseGuestDirectory {
  candidates: Ref<GuestCandidate[]>
  pending: Ref<boolean>
  refresh: () => Promise<void>
}

/**
 * Admin-only directory of everyone who could be added to a guest list: members,
 * the club roster, and past events' guests, merged + deduped by email. Loaded
 * once (the club is small) and searched client-side via `searchGuestCandidates`.
 * Reads run under RLS — every table here has an admin read policy.
 */
export function useGuestDirectory(): UseGuestDirectory {
  const supabase = useSupabaseClient<Database>()
  const candidates = ref<GuestCandidate[]>([])
  const pending = ref(true)

  async function refresh(): Promise<void> {
    pending.value = true
    const [members, roster, pastGuests] = await Promise.all([
      supabase.from('profiles').select('email, display_name'),
      supabase.from('invites').select('email, display_name'),
      supabase.from('event_invites').select('email, display_name')
    ])
    candidates.value = mergeGuestCandidates(members.data ?? [], roster.data ?? [], pastGuests.data ?? [])
    pending.value = false
  }

  onMounted(refresh)

  return { candidates, pending, refresh }
}
