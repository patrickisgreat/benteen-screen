-- ============================================================================
-- RSVP-gated participation. You must be RSVP'd "going" to an event before you
-- can suggest a movie or cast a vote for it. RLS is the boundary (Invariant 1) —
-- the gate is enforced in the policies, the overview UI only mirrors it.
--
-- "going" specifically: "maybe" and "no" are not commitments, so they don't get
-- to shape the ballot. Unvoting/removing your own rows stays open (you can always
-- back out); only *creating* a suggestion or vote requires the going RSVP.
-- ============================================================================

-- Am I (auth.uid()) RSVP'd "going" to this event? SECURITY DEFINER (search_path
-- = '') so it can read rsvps from inside another table's policy without tripping
-- RLS or recursing — mirrors public.is_allowed() / public.is_voting_locked().
create function public.is_going(eid uuid) returns boolean
  language sql security definer set search_path = '' stable as $$
  select exists (
    select 1 from public.rsvps r
    where r.event_id = eid and r.user_id = auth.uid() and r.status = 'going'
  );
$$;
revoke all on function public.is_going(uuid) from public;
grant execute on function public.is_going(uuid) to authenticated;

-- Same check, resolved through a suggestion (votes carry no event_id — same shape
-- as is_voting_locked(suggestion_id)).
create function public.is_going_for_suggestion(sid uuid) returns boolean
  language sql security definer set search_path = '' stable as $$
  select exists (
    select 1
    from public.suggestions s
    join public.rsvps r on r.event_id = s.event_id
    where s.id = sid and r.user_id = auth.uid() and r.status = 'going'
  );
$$;
revoke all on function public.is_going_for_suggestion(uuid) from public;
grant execute on function public.is_going_for_suggestion(uuid) to authenticated;

-- ---------- Gate the participation writes ----------
-- AND the going check onto the existing insert policies (keep every prior clause:
-- own row, not deleted, allowlisted, not blocked, voting not locked).

drop policy "suggestions: create own" on public.suggestions;
create policy "suggestions: create own" on public.suggestions
  for insert to authenticated
  with check (
    user_id = auth.uid() and deleted = false and public.is_allowed() and not public.is_blocked()
    and (select voting_locked_at from public.events where id = event_id) is null
    and public.is_going(event_id)
  );

drop policy "votes: insert own" on public.votes;
create policy "votes: insert own" on public.votes
  for insert to authenticated
  with check (
    user_id = auth.uid() and public.is_allowed() and not public.is_blocked()
    and not public.is_voting_locked(suggestion_id)
    and public.is_going_for_suggestion(suggestion_id)
  );
