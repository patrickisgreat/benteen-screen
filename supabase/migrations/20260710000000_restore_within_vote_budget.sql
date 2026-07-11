-- ============================================================================
-- Restoring state on re-RSVP must respect each voter's vote budget.
--
-- When an author left "going", their suggestions were hidden and the votes other
-- members had cast on them stopped counting — freeing those members to re-spend
-- that vote elsewhere. On the author's return the suggestions come back, and every
-- vote on them silently started counting again with NO budget check. A member who
-- had re-spent their freed vote could end up over their limit, and a returned vote
-- would "come back" even though its owner had already moved on.
--
-- Desired rule (confirmed): a returned vote only stands if its owner still has an
-- open slot. If they spent it on newer votes, the returned (older) one drops out —
-- it is hidden, not deleted, so it can come back later if a slot frees up.
--
-- So the restore branch of sync_rsvp_visibility now, after un-hiding the author's
-- suggestions + their own votes, reconciles every affected voter (anyone with a
-- vote on a just-restored suggestion, plus the returning author) down to their
-- vote limit: keep their newest `limit` live votes, hide the rest. Newest-wins, so
-- a vote re-cast while the suggestion was away is kept and the stale returning vote
-- yields. The hide branch and the re-suggest collision guard are unchanged.
-- ============================================================================

create or replace function public.sync_rsvp_visibility() returns trigger
  language plpgsql security definer set search_path = '' as $$
declare
  uid          uuid;
  eid          uuid;
  going        boolean;
  restored_ids uuid[];
begin
  if tg_op = 'DELETE' then
    uid := old.user_id; eid := old.event_id; going := false;
  else
    uid := new.user_id; eid := new.event_id; going := (new.status = 'going');
  end if;

  if going then
    -- 1. Restore this user's suggestions, EXCEPT any whose movie is already live on
    --    the ballot under another row (re-suggested while they were away) — that one
    --    stays hidden. Capture the ids actually un-hidden for the budget pass below.
    with upd as (
      update public.suggestions s
        set rsvp_hidden_at = null
        where s.user_id = uid and s.event_id = eid and s.rsvp_hidden_at is not null
          and not exists (
            select 1 from public.suggestions o
            where o.event_id = s.event_id
              and (o.tmdb_movie ->> 'id') = (s.tmdb_movie ->> 'id')
              and o.id <> s.id
              and o.deleted = false and o.rsvp_hidden_at is null
          )
        returning s.id
    )
    select coalesce(array_agg(id), array[]::uuid[]) into restored_ids from upd;

    -- 2. Un-hide this user's own votes for the event (budget-reconciled in step 3).
    update public.votes v
      set hidden_at = null
      from public.suggestions s
      where v.suggestion_id = s.id and s.event_id = eid
        and v.user_id = uid and v.hidden_at is not null;

    -- 3. Budget reconciliation. Everyone with a vote on a just-restored suggestion
    --    (plus this returning user) must not exceed their vote limit now that hidden
    --    suggestions/votes are back. Keep each voter's newest `limit` live votes and
    --    hide the rest: a returned vote only stands if its owner still has a slot;
    --    if they re-spent it on newer votes, the stale returned one drops out.
    with affected as (
      select distinct v.user_id
        from public.votes v
        where v.suggestion_id = any(restored_ids) and v.hidden_at is null
      union
      select uid
    ),
    ranked as (
      select v.suggestion_id, v.user_id,
        row_number() over (
          partition by v.user_id order by v.created_at desc, v.suggestion_id desc
        ) as rk
      from public.votes v
      join public.suggestions s on s.id = v.suggestion_id
      join affected a on a.user_id = v.user_id
      where v.hidden_at is null and s.event_id = eid
        and s.deleted = false and s.rsvp_hidden_at is null and s.culled_at is null
    )
    update public.votes v
      set hidden_at = now()
      from ranked r
      where v.user_id = r.user_id and v.suggestion_id = r.suggestion_id
        and v.hidden_at is null and r.rk > public.vote_limit();
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
