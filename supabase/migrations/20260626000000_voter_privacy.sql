-- Voter privacy — hide who voted for what from non-admins.
--
-- Until now `votes: read` was `using (true)`: any signed-in user could read every
-- vote row (including user_id) straight from the client. RLS — not the UI — is the
-- authorization boundary (Invariant 1), so that leaked who voted for which movie to
-- anyone with the browser console.
--
-- We tighten reads to "your own votes, or everything if you're an admin" (the admin
-- drill-downs in admin.vue legitimately show voter names). Public per-suggestion vote
-- COUNTS are served through a SECURITY DEFINER tally so the overview leaderboard still
-- works without exposing identities. Vote integrity (Invariant 3) is preserved: counts
-- are still computed from the normalized rows on demand — there is no stored counter to
-- drift. Live counts for other users now ride a lightweight client broadcast (the
-- per-vote postgres_changes stream is, correctly, no longer visible cross-user).

-- 1. Tighten the read policy: own votes, or all for admins.
drop policy "votes: read" on public.votes;
create policy "votes: read own or admin" on public.votes
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- 2. Public per-suggestion vote counts, no voter identities. SECURITY DEFINER so it
--    can count rows the caller can no longer read directly; only counts are returned.
--    `auth.uid()` inside a SECURITY DEFINER body still resolves to the *caller* (it
--    reads request.jwt.claims), so the is_allowed() gate keeps this consistent with
--    the invite-only model: a signed-in but non-invited user gets an empty result,
--    not a back door around RLS via a guessed event UUID.
create or replace function public.suggestion_vote_counts(p_event_id uuid)
  returns table (suggestion_id uuid, votes bigint)
  language sql security definer stable set search_path = public as $$
  select v.suggestion_id, count(*)::bigint
  from public.votes v
  join public.suggestions s on s.id = v.suggestion_id
  where s.event_id = p_event_id and s.deleted = false
    and public.is_allowed()
  group by v.suggestion_id
$$;
revoke all on function public.suggestion_vote_counts(uuid) from public;
grant execute on function public.suggestion_vote_counts(uuid) to authenticated;
