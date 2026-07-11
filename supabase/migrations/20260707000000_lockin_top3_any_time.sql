-- ============================================================================
-- Broaden lock-in: a top-3 contender is protected from an un-RSVP hide at ANY
-- time, not only in the final week.
--
-- The original lock-in (20260702) only shielded a top-3 suggestion once the event
-- was within 7 days. In practice a strong pick got yanked off the ballot weeks out
-- the moment its author left "going" — exactly the surprise we want to avoid. The
-- rule people expect is simpler: if a movie is a top-3 vote-getter, the author
-- bailing shouldn't remove it, whenever that happens.
--
-- So `is_locked_in` drops the event-date window. A suggestion is locked in when it
-- ranks in the top 3 by live votes AND has at least one vote. The ≥1-vote floor is
-- kept deliberately: a zero-vote suggestion isn't a contender, so the author's
-- un-RSVP may still hide it (unchanged). The hide/restore trigger already calls
-- this function by name, so replacing the body is all that's needed.
-- ============================================================================

create or replace function public.is_locked_in(sid uuid) returns boolean
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
    where r.id = sid and r.rk <= 3 and r.votes > 0
  );
$$;
revoke all on function public.is_locked_in(uuid) from public;
grant execute on function public.is_locked_in(uuid) to authenticated;
