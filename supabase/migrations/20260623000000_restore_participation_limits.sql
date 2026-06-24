-- ============================================================================
-- Restore the per-event participation limits: 5 suggestions and 3 votes per user
-- per event, enforced server-side (Product Invariant 3 — RLS/triggers are the
-- real boundary; the UI in shared/utils/limits.ts only mirrors these numbers).
--
-- They were dropped in 20260616010000_user_id_and_drop_limits.sql because the
-- imported Firestore history had users far over the cap. The triggers fire only
-- on INSERT, so they enforce going forward without touching existing rows (a
-- user already over the cap simply can't add more). Service-role / SQL inserts
-- (auth.uid() is null) stay exempt so imports and admin scripts aren't blocked.
--
-- Counting is by auth.uid() rather than NEW.user_id so this is independent of the
-- set_user_id trigger firing order (NEW.user_id is stamped by another BEFORE
-- INSERT trigger; auth.uid() is the authoritative actor either way).
-- ============================================================================

create or replace function public.suggestion_limit() returns int language sql immutable as $$ select 5 $$;
create or replace function public.vote_limit() returns int language sql immutable as $$ select 3 $$;

-- Per-event suggestion cap.
create or replace function public.enforce_suggestion_limit() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and (
    select count(*) from public.suggestions
    where event_id = new.event_id and user_id = auth.uid() and deleted = false
  ) >= public.suggestion_limit() then
    raise exception 'Suggestion limit (%) reached for this event', public.suggestion_limit()
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
drop trigger if exists enforce_suggestion_limit_trigger on public.suggestions;
create trigger enforce_suggestion_limit_trigger
  before insert on public.suggestions
  for each row execute function public.enforce_suggestion_limit();

-- Per-event vote cap. Votes carry no event_id, so resolve it through the suggestion.
create or replace function public.enforce_vote_limit() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  ev uuid;
begin
  select event_id into ev from public.suggestions where id = new.suggestion_id;
  if auth.uid() is not null and (
    select count(*) from public.votes v
    join public.suggestions s on s.id = v.suggestion_id
    where v.user_id = auth.uid() and s.event_id = ev and s.deleted = false
  ) >= public.vote_limit() then
    raise exception 'Vote limit (%) reached for this event', public.vote_limit()
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
drop trigger if exists enforce_vote_limit_trigger on public.votes;
create trigger enforce_vote_limit_trigger
  before insert on public.votes
  for each row execute function public.enforce_vote_limit();
