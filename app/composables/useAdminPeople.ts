import type { Database } from "~/types/database.types";
import type { Profile } from "#shared/types/user";
import type { Invite } from "#shared/types/invite";

/**
 * Admin people directory: joined members (profiles) plus pending invites (people
 * on the allowlist who haven't signed in yet), so the directory is the whole
 * guest list — searchable, not just whoever happens to have logged in. Members
 * can be banned/unbanned (admin RPC); pending invites can be revoked.
 */
export function useAdminPeople() {
  const supabase = useSupabaseClient<Database>();
  const people = ref<Profile[]>([]);
  const pendingInvites = ref<Invite[]>([]);
  const pending = ref(true);
  const loadError = ref<string | null>(null);

  async function refresh(): Promise<void> {
    pending.value = true;
    loadError.value = null;
    const [members, invites] = await Promise.all([
      supabase
        .from("profiles")
        .select(
          "id, email, display_name, avatar_url, is_admin, blocked, created_at",
        )
        .order("display_name"),
      supabase
        .from("invites")
        .select("email, invited_by, display_name, created_at, accepted_at")
        .is("accepted_at", null)
        .order("created_at", { ascending: false }),
    ]);
    // Surface failures instead of silently showing an empty directory.
    if (members.error || invites.error) {
      loadError.value =
        (members.error ?? invites.error)?.message ?? "Failed to load people";
    }
    people.value = members.data ?? [];
    pendingInvites.value = invites.data ?? [];
    pending.value = false;
  }

  onMounted(refresh);

  /** Ban or unban a member. Authorization is enforced in the RPC (admin-only). */
  async function setBlocked(id: string, value: boolean): Promise<void> {
    const { error } = await supabase.rpc("admin_set_blocked", {
      target_id: id,
      value,
    });
    if (error) throw error;
    await refresh();
  }

  /** Grant or revoke admin. Enforced in the RPC (admin-only; can't change your own —
   *  is_admin stays out-of-band, Invariant 4). */
  async function setAdmin(id: string, value: boolean): Promise<void> {
    const { error } = await supabase.rpc("admin_set_admin", {
      target_id: id,
      value,
    });
    if (error) throw error;
    await refresh();
  }

  /** Withdraw a pending invite. RLS allows admins to delete any invite. */
  async function revokeInvite(email: string): Promise<void> {
    const { error } = await supabase
      .from("invites")
      .delete()
      .eq("email", email);
    if (error) throw error;
    await refresh();
  }

  return {
    people,
    pendingInvites,
    pending,
    loadError,
    setBlocked,
    setAdmin,
    revokeInvite,
  };
}
