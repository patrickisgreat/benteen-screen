-- ============================================================================
-- ONE-OFF DATA FIX — run manually in the Supabase SQL editor (or psql).
--
-- Scenario: a movie ("Mario") was suggested, its author left "going" so the
-- suggestion was hidden, then another member re-suggested the same movie (now
-- possible — see migration 20260709000000_resuggest_hidden_movie.sql). The votes
-- the movie had are stranded on the old, hidden suggestion. This moves them onto
-- the new, active suggestion so the movie regains its tally.
--
-- This is intentionally NOT a migration: it mutates votes (Product Invariant 3),
-- targets one specific production row, and must run exactly once under review — so
-- it stays out of the auto-running migration path. It is safe to run repeatedly:
-- once the source votes are moved there is nothing left to move (idempotent), and
-- with the two values below unset it does nothing at all.
--
-- HOW TO USE
--   1. Find the event id and the movie's TMDB id. To confirm the exact rows:
--        select s.id, s.user_id, s.deleted, s.rsvp_hidden_at, s.culled_at,
--               s.tmdb_movie ->> 'id'    as tmdb_id,
--               s.tmdb_movie ->> 'title' as title,
--               count(v.*) filter (where v.hidden_at is null) as live_votes
--        from public.suggestions s
--        left join public.votes v on v.suggestion_id = s.id
--        where lower(s.tmdb_movie ->> 'title') like '%mario%'
--        group by s.id
--        order by s.event_id, s.created_at;
--      You should see two rows for the same event + tmdb_id: one hidden (source)
--      and one active (target).
--   2. Set v_event_id and v_tmdb_id below to that event and movie.
--   3. Run it. It prints how many votes moved.
-- ============================================================================

do $$
declare
  v_event_id uuid := null;   -- TODO: the affected event's id
  v_tmdb_id  text := null;   -- TODO: the movie's TMDB id as text, e.g. '502356'
  v_target   uuid;
  v_moved    int;
  v_deduped  int;
begin
  if v_event_id is null or v_tmdb_id is null then
    raise notice 'Set v_event_id and v_tmdb_id first — nothing done.';
    return;
  end if;

  -- The single active, on-ballot suggestion of this movie that should own the votes.
  select id into v_target
  from public.suggestions
  where event_id = v_event_id
    and (tmdb_movie ->> 'id') = v_tmdb_id
    and deleted = false and rsvp_hidden_at is null and culled_at is null;

  if v_target is null then
    raise exception 'No single active on-ballot suggestion for movie % in event % — resolve by hand.', v_tmdb_id, v_event_id;
  end if;

  -- A voter who already voted on the target would clash on the (suggestion_id,
  -- user_id) primary key, so drop their now-redundant vote on the source row(s).
  with sources as (
    select id from public.suggestions
    where event_id = v_event_id and (tmdb_movie ->> 'id') = v_tmdb_id and id <> v_target
  )
  delete from public.votes v
  using sources s
  where v.suggestion_id = s.id
    and exists (select 1 from public.votes t where t.suggestion_id = v_target and t.user_id = v.user_id);
  get diagnostics v_deduped = row_count;

  -- Move the remaining votes onto the target. hidden_at is preserved on purpose:
  -- a voter who has since un-RSVP'd keeps their vote hidden (it should not count),
  -- while still-"going" voters' votes count again now that the target is on the
  -- ballot. Each voter can have voted on this movie only once, so no voter ends up
  -- with two Mario votes and nobody's per-event vote budget changes.
  with sources as (
    select id from public.suggestions
    where event_id = v_event_id and (tmdb_movie ->> 'id') = v_tmdb_id and id <> v_target
  )
  update public.votes v
    set suggestion_id = v_target
  from sources s
  where v.suggestion_id = s.id;
  get diagnostics v_moved = row_count;

  raise notice 'Reassigned % vote(s) onto suggestion % (dropped % duplicate(s)).', v_moved, v_target, v_deduped;
end $$;
