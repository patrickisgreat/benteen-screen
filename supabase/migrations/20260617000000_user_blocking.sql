-- ============================================================================
-- Admin user blocking (ban). A blocked user can still read, but cannot write
-- (suggest, vote, RSVP, or touch the bring list). RLS is the boundary — the
-- admin UI is only a convenience (Invariant 1). is_admin is never touched here
-- (Invariant 4): blocking only flips `blocked`, via an admin-gated RPC.
-- ============================================================================

alter table public.profiles add column if not exists blocked boolean not null default false;

-- Current user's blocked flag. SECURITY DEFINER to avoid RLS recursion on
-- profiles (mirrors public.is_admin()).
create function public.is_blocked() returns boolean
  language sql security definer set search_path = '' stable as $$
  select coalesce((select blocked from public.profiles where id = auth.uid()), false);
$$;

-- Admin-only, column-safe ban/unban: only ever changes `blocked`, never is_admin.
create function public.admin_set_blocked(target_id uuid, value boolean)
  returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'only admins may block users';
  end if;
  update public.profiles set blocked = value where id = target_id;
end;
$$;
revoke all on function public.admin_set_blocked(uuid, boolean) from public;
grant execute on function public.admin_set_blocked(uuid, boolean) to authenticated;

-- ---------- Deny writes from blocked users (recreate each write policy) ----------
drop policy "suggestions: create own" on public.suggestions;
create policy "suggestions: create own" on public.suggestions
  for insert to authenticated
  with check (user_id = auth.uid() and deleted = false and not public.is_blocked());

drop policy "votes: insert own" on public.votes;
create policy "votes: insert own" on public.votes
  for insert to authenticated
  with check (user_id = auth.uid() and not public.is_blocked());

drop policy "rsvps: insert own" on public.rsvps;
create policy "rsvps: insert own" on public.rsvps
  for insert to authenticated
  with check (user_id = auth.uid() and not public.is_blocked());

drop policy "rsvps: update own" on public.rsvps;
create policy "rsvps: update own" on public.rsvps
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and not public.is_blocked());

drop policy "bring: create" on public.bring_items;
create policy "bring: create" on public.bring_items
  for insert to authenticated
  with check (created_by = auth.uid() and (user_id is null or user_id = auth.uid()) and not public.is_blocked());

drop policy "bring: update" on public.bring_items;
create policy "bring: update" on public.bring_items
  for update to authenticated
  using (created_by = auth.uid() or user_id = auth.uid() or user_id is null)
  with check ((user_id is null or user_id = auth.uid()) and not public.is_blocked());
