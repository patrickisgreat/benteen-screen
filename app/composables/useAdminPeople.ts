import type { Database } from '~/types/database.types'
import type { Contact, PersonDetails, Profile } from '#shared/types/user'
import type { Invite } from '#shared/types/invite'

/**
 * Admin people directory: joined members (profiles) plus pending invites (people
 * on the allowlist who haven't signed in yet), so the directory is the whole
 * guest list — searchable, not just whoever happens to have logged in. Members
 * can be banned/unbanned (admin RPC); pending invites can be revoked; anyone's
 * name and mobile number can be edited (contacts is the admin-only phone store).
 */
export function useAdminPeople() {
  const supabase = useSupabaseClient<Database>()
  const people = ref<Profile[]>([])
  const pendingInvites = ref<Invite[]>([])
  const contacts = ref<Contact[]>([])
  const pending = ref(true)
  const loadError = ref<string | null>(null)

  async function refresh(): Promise<void> {
    pending.value = true
    loadError.value = null
    const [members, invites, numbers] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, email, display_name, avatar_url, is_admin, blocked, created_at')
        .order('display_name'),
      supabase
        .from('invites')
        .select('email, invited_by, display_name, created_at, accepted_at')
        .is('accepted_at', null)
        .order('created_at', { ascending: false }),
      supabase
        .from('contacts')
        .select('email, phone, updated_at')
        .order('email')
    ])
    // Surface failures instead of silently showing an empty directory.
    if (members.error || invites.error || numbers.error) {
      loadError.value = (members.error ?? invites.error ?? numbers.error)?.message ?? 'Failed to load people'
    }
    people.value = members.data ?? []
    pendingInvites.value = invites.data ?? []
    contacts.value = numbers.data ?? []
    pending.value = false
  }

  onMounted(refresh)

  /** Ban or unban a member. Authorization is enforced in the RPC (admin-only). */
  async function setBlocked(id: string, value: boolean): Promise<void> {
    const { error } = await supabase.rpc('admin_set_blocked', { target_id: id, value })
    if (error) throw error
    await refresh()
  }

  /** Grant or revoke admin. Enforced in the RPC (admin-only; can't change your own —
   *  is_admin stays out-of-band, Invariant 4). */
  async function setAdmin(id: string, value: boolean): Promise<void> {
    const { error } = await supabase.rpc('admin_set_admin', { target_id: id, value })
    if (error) throw error
    await refresh()
  }

  /** Withdraw a pending invite. RLS allows admins to delete any invite. */
  async function revokeInvite(email: string): Promise<void> {
    const { error } = await supabase.from('invites').delete().eq('email', email)
    if (error) throw error
    await refresh()
  }

  /** Save a person's name and mobile number. The name goes where the person
   *  lives — a member's profile (column-safe admin RPC) or their roster entry —
   *  and the number goes to their admin-only contact record. Every guest-list row
   *  for that email is brought in step too, so e-vites greet and texts dial the
   *  corrected details without re-adding anyone. */
  async function updatePerson(details: PersonDetails): Promise<void> {
    const name = details.displayName?.trim() || null
    const phone = details.phone
    if (details.profileId) {
      if (!name) throw new Error('A member needs a display name')
      const { error } = await supabase.rpc('admin_set_display_name', { target_id: details.profileId, value: name })
      if (error) throw error
    } else {
      const { error } = await supabase.from('invites').update({ display_name: name }).eq('email', details.email)
      if (error) throw error
    }

    const contact = phone
      ? await supabase.from('contacts').upsert({ email: details.email, phone, updated_at: new Date().toISOString() }, { onConflict: 'email' })
      : await supabase.from('contacts').delete().eq('email', details.email)
    if (contact.error) throw contact.error

    const guestRows = await supabase.from('event_invites').update({ display_name: name, phone }).eq('email', details.email)
    if (guestRows.error) throw guestRows.error

    await refresh()
  }

  return { people, pendingInvites, contacts, pending, loadError, setBlocked, setAdmin, revokeInvite, updatePerson }
}
