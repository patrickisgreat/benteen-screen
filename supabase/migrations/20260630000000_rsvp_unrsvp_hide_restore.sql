-- ============================================================================
-- Un-RSVP hides your stuff; re-RSVP restores it.
--
-- When a user leaves "going" (→ maybe/no, or clears their RSVP entirely) their
-- suggestions are hidden and their votes are soft-deleted for that event. When
-- they return to "going", everything is restored to its prior state. Nothing is
-- ever hard-deleted, so restore is exact.
--
-- The hide/restore is driven by a trigger on `rsvps` (Invariant 1 — enforcement
-- lives in the database, not the client). Two NEW soft-hide flags, kept separate
-- from admin moderation so the reasons compose instead of colliding:
--   * suggestions.rsvp_hidden_at — distinct from `deleted` (admin moderation), so
--     a re-RSVP can never un-delete a suggestion an admin removed.
--   * votes.hidden_at — votes had no soft-delete at all (hard-delete only).
--
-- "Effectively visible" becomes `deleted = false AND rsvp_hidden_at is null` for a
-- suggestion, and `hidden_at is null` for a vote. Every read path that decides the
-- ballot is updated to honor it: the tally RPC, the participation-limit triggers
-- (so a voter whose pick gets hidden gets their budget back — client and server
-- agree), and the overview/winners reads in app code.
-- ============================================================================

alter table public.suggestions add column if not exists rsvp_hidden_at timestamptz;
alter table public.votes       add column if not exists hidden_at      timestamptz;

-- ---------- Hide / restore trigger ----------
-- AFTER each rsvps change, reconcile the acting user's suggestions + votes for the
-- event to match their new "going" state. SECURITY DEFINER so it can update rows a
-- normal user has no UPDATE policy for (suggestions/votes); it only ever touches
-- the rsvp row's own user_id, never anyone else's. Restores clear ONLY the
-- rsvp-hide flags — admin `deleted` is left untouched.
create function public.sync_rsvp_visibility() returns trigger
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
    -- Hide: soft-delete this user's suggestions + votes for the event.
    update public.suggestions
      set rsvp_hidden_at = now()
      where user_id = uid and event_id = eid and rsvp_hidden_at is null;
    update public.votes v
      set hidden_at = now()
      from public.suggestions s
      where v.suggestion_id = s.id and s.event_id = eid
        and v.user_id = uid and v.hidden_at is null;
  end if;

  return null; -- AFTER trigger: return value is ignored.
end;
$$;

create trigger rsvps_sync_visibility
  after insert or update or delete on public.rsvps
  for each row execute function public.sync_rsvp_visibility();

-- ---------- Read paths: exclude hidden from the ballot ----------

-- Tally: count only live votes on live suggestions (drop soft-deleted votes and
-- rsvp-hidden / admin-deleted suggestions).
create or replace function public.suggestion_vote_counts(p_event_id uuid)
  returns table (suggestion_id uuid, votes bigint)
  language sql security definer stable set search_path = public as $$
  select v.suggestion_id, count(*)::bigint
  from public.votes v
  join public.suggestions s on s.id = v.suggestion_id
  where s.event_id = p_event_id and s.deleted = false and s.rsvp_hidden_at is null
    and v.hidden_at is null
    and public.is_allowed()
  group by v.suggestion_id
$$;
revoke all on function public.suggestion_vote_counts(uuid) from public;
grant execute on function public.suggestion_vote_counts(uuid) to authenticated;

-- ---------- Participation limits: count only live participation ----------
-- A suggestion/vote that's hidden (rsvp) or admin-deleted no longer occupies a
-- slot, so the cap math must ignore it — otherwise a voter whose pick gets hidden
-- would see freed budget in the UI but be rejected by the server (mismatch).

create or replace function public.enforce_suggestion_limit() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and (
    select count(*) from public.suggestions
    where event_id = new.event_id and user_id = auth.uid()
      and deleted = false and rsvp_hidden_at is null
  ) >= public.suggestion_limit() then
    raise exception 'Suggestion limit (%) reached for this event', public.suggestion_limit()
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create or replace function public.enforce_vote_limit() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  ev uuid;
begin
  select event_id into ev from public.suggestions where id = new.suggestion_id;
  if auth.uid() is not null and (
    select count(*) from public.votes v
    join public.suggestions s on s.id = v.suggestion_id
    where v.user_id = auth.uid() and s.event_id = ev
      and s.deleted = false and s.rsvp_hidden_at is null and v.hidden_at is null
  ) >= public.vote_limit() then
    raise exception 'Vote limit (%) reached for this event', public.vote_limit()
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
