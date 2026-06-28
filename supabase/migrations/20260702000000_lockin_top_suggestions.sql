-- ============================================================================
-- Home-stretch lock-in. As the event nears, a strong contender shouldn't be
-- yanked off the ballot just because the person who suggested it can't come.
--
-- A suggestion is "locked in" when it's a TOP-3 live-vote-getter (with at least
-- one vote) AND the event is within a week. A locked-in suggestion is NOT hidden
-- when its author leaves "going" — only the rest of their suggestions are. (Culling
-- is admin-driven and intentional, so it's unaffected; this guards the automatic
-- un-RSVP hide only.)
-- ============================================================================

-- Is this suggestion locked in (top-3 by live votes, ≥1 vote, event ≤7 days out)?
-- SECURITY DEFINER so the trigger can rank behind RLS.
create function public.is_locked_in(sid uuid) returns boolean
  language sql security definer set search_path = public stable as $$
  with ranked as (
    select s.id,
      count(v.suggestion_id) filter (where v.hidden_at is null) as votes,
      row_number() over (
        order by count(v.suggestion_id) filter (where v.hidden_at is null) desc, s.created_at asc
      ) as rk
    from public.suggestions s
    left join public.votes v on v.suggestion_id = s.id
    where s.deleted = false and s.rsvp_hidden_at is null and s.culled_at is null
      and s.event_id = (select event_id from public.suggestions where id = sid)
    group by s.id, s.created_at
  )
  select exists (
    select 1
    from ranked r
    join public.suggestions s on s.id = r.id
    join public.events e on e.id = s.event_id
    where r.id = sid and r.rk <= 3 and r.votes > 0
      and e.event_date <= now() + interval '7 days'
  );
$$;
revoke all on function public.is_locked_in(uuid) from public;
grant execute on function public.is_locked_in(uuid) to authenticated;

-- Recreate the hide/restore trigger so the hide branch skips locked-in suggestions.
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
    -- Restore: un-hide this user's suggestions + votes for the event.
    update public.suggestions
      set rsvp_hidden_at = null
      where user_id = uid and event_id = eid and rsvp_hidden_at is not null;
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
