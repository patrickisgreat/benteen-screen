-- ============================================================================
-- Stamp inserts with the authenticated user, and drop the per-event limits.
--
-- The client no longer sends user_id; this trigger forces it to auth.uid() so a
-- flaky client-side session can never cause an RLS 403 (user_id ≠ auth.uid()).
-- Service-role / SQL editor inserts (auth.uid() is null) keep their explicit
-- user_id, so the data migration still works.
-- ============================================================================

create or replace function public.set_user_id() returns trigger
  language plpgsql as $$
begin
  if auth.uid() is not null then
    new.user_id := auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists set_user_id_votes on public.votes;
create trigger set_user_id_votes before insert on public.votes
  for each row execute function public.set_user_id();

drop trigger if exists set_user_id_suggestions on public.suggestions;
create trigger set_user_id_suggestions before insert on public.suggestions
  for each row execute function public.set_user_id();

-- Remove the per-event participation limits. Real usage is open voting (the
-- migrated history has users with 70+ votes in a single event), and the limits
-- blocked organizers whose history exceeded them.
drop trigger if exists enforce_vote_limit_trigger on public.votes;
drop trigger if exists enforce_suggestion_limit_trigger on public.suggestions;
drop function if exists public.enforce_vote_limit();
drop function if exists public.enforce_suggestion_limit();
drop function if exists public.vote_limit();
drop function if exists public.suggestion_limit();

-- The UI checks admin via this RPC (auth.uid()-based) instead of a cached client id.
grant execute on function public.is_admin() to authenticated;
