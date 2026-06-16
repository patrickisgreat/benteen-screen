-- ============================================================================
-- Lock voting / end voting. An admin can end voting for an event: no more votes
-- or suggestions, and the top-voted films become the "double feature" winners.
-- RLS is the boundary (Invariant 1) — the lock is enforced in the policies, not
-- just hidden in the UI.
-- ============================================================================

alter table public.events add column if not exists voting_locked_at timestamptz;

-- Is voting locked for the event this suggestion belongs to? SECURITY DEFINER so
-- it can resolve the event behind RLS (votes carry no event_id).
create function public.is_voting_locked(sid uuid) returns boolean
  language sql security definer set search_path = '' stable as $$
  select exists (
    select 1
    from public.suggestions s
    join public.events e on e.id = s.event_id
    where s.id = sid and e.voting_locked_at is not null
  );
$$;
revoke all on function public.is_voting_locked(uuid) from public;
grant execute on function public.is_voting_locked(uuid) to authenticated;

-- No new votes once voting is locked (and no un-voting — results are final).
drop policy "votes: insert own" on public.votes;
create policy "votes: insert own" on public.votes
  for insert to authenticated
  with check (
    user_id = auth.uid() and public.is_allowed() and not public.is_blocked()
    and not public.is_voting_locked(suggestion_id)
  );

drop policy "votes: delete own" on public.votes;
create policy "votes: delete own" on public.votes
  for delete to authenticated
  using (user_id = auth.uid() and not public.is_voting_locked(suggestion_id));

-- No new suggestions once voting is locked.
drop policy "suggestions: create own" on public.suggestions;
create policy "suggestions: create own" on public.suggestions
  for insert to authenticated
  with check (
    user_id = auth.uid() and deleted = false and public.is_allowed() and not public.is_blocked()
    and (select voting_locked_at from public.events where id = event_id) is null
  );
