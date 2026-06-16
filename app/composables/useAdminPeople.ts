import type { Database } from '~/types/database.types'
import type { Profile } from '#shared/types/user'

/** Admin people directory: every profile + ban/unban (via the admin-gated RPC). */
export function useAdminPeople() {
  const supabase = useSupabaseClient<Database>()
  const people = ref<Profile[]>([])
  const pending = ref(true)

  async function refresh(): Promise<void> {
    const { data } = await supabase
      .from('profiles')
      .select('id, email, display_name, avatar_url, is_admin, blocked, created_at')
      .order('display_name')
    people.value = data ?? []
    pending.value = false
  }

  onMounted(refresh)

  /** Ban or unban a user. Authorization is enforced in the RPC (admin-only). */
  async function setBlocked(id: string, value: boolean): Promise<void> {
    const { error } = await supabase.rpc('admin_set_blocked', { target_id: id, value })
    if (error) throw error
    await refresh()
  }

  return { people, pending, setBlocked }
}
