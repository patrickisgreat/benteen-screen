-- ============================================================================
-- Data fix: restore Super Mario Bros. (1993, Dennis Hopper) as a suggestion.
--
-- The movie was suggested on a past event and collected votes. Re-add it to
-- the next upcoming event, attributed to Ryan Donald, and carry one vote over
-- for every user who voted on it historically (any prior suggestion of it).
--
-- Runs as plain SQL, so auth.uid() is null and the set_user_id +
-- participation-limit triggers deliberately don't apply — the same exemption
-- the Firestore import relied on (see 20260623000000_restore_participation_limits.sql).
--
-- Idempotent: re-running reuses the existing suggestion and the vote copy
-- upserts with `on conflict do nothing`. Fails loudly (aborting the whole
-- migration) if the profile, the historic suggestion, or an upcoming event
-- can't be found, rather than silently doing nothing.
-- ============================================================================

do $$
declare
  ryan_id      uuid;
  target_event uuid;
  target_title text;
  movie        jsonb;
  suggestion   uuid;
  copied       int;
begin
  select id into ryan_id
  from public.profiles
  where lower(email) = 'ryanthomasdonald@gmail.com';
  if ryan_id is null then
    raise exception 'No profile found for ryanthomasdonald@gmail.com';
  end if;

  -- Copy the movie payload from the most recent historic suggestion of it.
  -- TMDB id 9607 = Super Mario Bros. (1993); title+year fallback in case the
  -- imported jsonb carries a different id shape.
  select s.tmdb_movie into movie
  from public.suggestions s
  where s.tmdb_movie->>'id' = '9607'
     or (s.tmdb_movie->>'title' ilike 'super mario bros%'
         and s.tmdb_movie->>'release_date' like '1993%')
  order by s.created_at desc
  limit 1;
  if movie is null then
    raise exception 'No historic Super Mario Bros. (1993) suggestion found to copy from';
  end if;

  -- Attach to the next upcoming event.
  select id, title into target_event, target_title
  from public.events
  where event_date >= current_date
  order by event_date asc
  limit 1;
  if target_event is null then
    raise exception 'No upcoming event to attach the suggestion to';
  end if;
  raise notice 'Attaching to event "%" (%)', target_title, target_event;

  -- Reuse Ryan's existing suggestion of it on that event, else create one.
  select id into suggestion
  from public.suggestions
  where event_id = target_event
    and user_id = ryan_id
    and tmdb_movie->>'id' = movie->>'id'
    and deleted = false;
  if suggestion is null then
    insert into public.suggestions (event_id, user_id, tmdb_movie)
    values (target_event, ryan_id, movie)
    returning id into suggestion;
  end if;

  -- One vote per distinct historic voter, carried onto the new suggestion.
  insert into public.votes (suggestion_id, user_id)
  select distinct suggestion, v.user_id
  from public.votes v
  join public.suggestions s on s.id = v.suggestion_id
  where s.tmdb_movie->>'id' = movie->>'id'
    and s.id <> suggestion
  on conflict (suggestion_id, user_id) do nothing;
  get diagnostics copied = row_count;
  raise notice 'Carried % historic vote(s) onto suggestion %', copied, suggestion;
end;
$$;
