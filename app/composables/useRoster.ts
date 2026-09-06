import type { Database } from '~/types/database.types'
import type { Invite } from '#shared/types/invite'

/** What a bulk roster add did: who was added, who was already there, what didn't parse. */
export interface RosterAddResult {
  added: number
  skipped: number
  emailed: number
  failed: number
  invalid: string[]
  error: string | null
}

/**
 * The club allowlist (`public.invites`) as a whole — the roster people belong to
 * between screenings, distinct from `event_invites` (one event's guest list).
 * Reads run under RLS; the bulk add is a server route because it sends the
 * welcome emails with the server-only Resend key.
 */
export function useRoster() {
  const supabase = useSupabaseClient<Database>()
  const roster = ref<Invite[]>([])
  const pending = ref(true)
  const loadError = ref<string | null>(null)

  async function refresh(): Promise<void> {
    pending.value = true
    const { data, error } = await supabase
      .from('invites')
      .select('email, invited_by, display_name, created_at, accepted_at')
      .order('created_at', { ascending: false })
    loadError.value = error?.message ?? null
    roster.value = data ?? []
    pending.value = false
  }

  /** People on the roster who haven't signed in yet. */
  const pendingCount = computed(() => roster.value.filter(i => !i.accepted_at).length)

  /** Emails already on the roster, lowercased — the composer greys these out. */
  const existingEmails = computed(() => new Set(roster.value.map(i => i.email.toLowerCase())))

  async function addToRoster(text: string): Promise<RosterAddResult> {
    const result = await $fetch<RosterAddResult & { ok: boolean }>('/api/invites/roster', {
      method: 'POST',
      body: { text }
    })
    await refresh()
    return result
  }

  onMounted(refresh)

  return { roster, pending, pendingCount, existingEmails, loadError, refresh, addToRoster }
}
