-- ============================================================================
-- Manage the admin role from the People section. is_admin stays out-of-band
-- (Invariant 4): the RLS update policy on profiles still forbids a user from
-- changing is_admin directly. This admin-only SECURITY DEFINER RPC is the single
-- controlled path, mirroring admin_set_blocked. You cannot change your OWN admin
-- status — prevents locking yourself out or odd self-promotion edge cases.
-- ============================================================================

create function public.admin_set_admin(target_id uuid, value boolean)
  returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'only admins may change admin status';
  end if;
  if target_id = auth.uid() then
    raise exception 'you cannot change your own admin status';
  end if;
  update public.profiles set is_admin = value where id = target_id;
end;
$$;
revoke all on function public.admin_set_admin(uuid, boolean) from public;
grant execute on function public.admin_set_admin(uuid, boolean) to authenticated;
