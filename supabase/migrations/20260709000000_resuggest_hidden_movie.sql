-- ============================================================================
-- Let a movie be re-suggested once the earlier suggestion is hidden by un-RSVP.
--
-- The per-event "one suggestion per movie" unique index only ignored admin-deleted
-- rows (`where deleted = false`). A title whose author left "going" is soft-hidden
-- (rsvp_hidden_at set, deleted still false), so it kept reserving the movie — nobody
-- else could submit it and the insert failed with a unique violation. A hidden
-- suggestion is off the ballot, so it should not hold the slot.
--
-- Narrow the index to on-ballot rows: deleted = false AND rsvp_hidden_at is null.
-- Culled rows still hold their slot on purpose — a permanent cull must not be
-- undone by re-suggesting the title, so culled_at is intentionally NOT excluded.
--
-- Guarded consequence: when the original author later returns to "going", restoring
-- their hidden suggestion would collide with the newer active suggestion of the same
-- movie (two on-ballot rows → unique violation, which would break the RSVP trigger).
-- So the restore branch of sync_rsvp_visibility now skips any suggestion whose movie
-- is already live on the ballot under another row — it stays hidden; the active one
-- wins. (The hide branch and the vote hide/restore are unchanged.)
-- ============================================================================

drop index if exists public.suggestions_event_movie_unique;
create unique index suggestions_event_movie_unique
  on public.suggestions (event_id, ((tmdb_movie ->> 'id')))
  where deleted = false and rsvp_hidden_at is null;

create or replace function public.sync_rsvp_visibility() returns trigger
  language plpgsql security definer set search_path = '' as $$
declare
  uid   uuid;
  eid   uuid;
  going boolean;
begin
  if tg_op = 'DELETE' then
    uid := old.user_id; eid := old.event_id; going := false;
  else
    uid := new.user_id; eid := new.event_id; going := (new.status = 'going');
  end if;

  if going then
    -- Restore this user's suggestions, EXCEPT any whose movie is already live on
    -- the ballot under another row (re-suggested by someone else while they were
    -- away). Un-hiding it would duplicate an on-ballot title, so it stays hidden.
    update public.suggestions s
      set rsvp_hidden_at = null
      where s.user_id = uid and s.event_id = eid and s.rsvp_hidden_at is not null
        and not exists (
          select 1 from public.suggestions o
          where o.event_id = s.event_id
            and (o.tmdb_movie ->> 'id') = (s.tmdb_movie ->> 'id')
            and o.id <> s.id
            and o.deleted = false and o.rsvp_hidden_at is null
        );
    update public.votes v
      set hidden_at = null
      from public.suggestions s
      where v.suggestion_id = s.id and s.event_id = eid
        and v.user_id = uid and v.hidden_at is not null;
  else
    -- Hide this user's suggestions, EXCEPT any locked in for the home stretch.
    update public.suggestions
      set rsvp_hidden_at = now()
      where user_id = uid and event_id = eid and rsvp_hidden_at is null
        and not public.is_locked_in(id);
    update public.votes v
      set hidden_at = now()
      from public.suggestions s
      where v.suggestion_id = s.id and s.event_id = eid
        and v.user_id = uid and v.hidden_at is null;
  end if;

  return null;
end;
$$;
