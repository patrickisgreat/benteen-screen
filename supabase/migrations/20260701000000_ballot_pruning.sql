-- ============================================================================
-- Ballot pruning. As an event nears, titles are permanently culled from the
-- ballot: a zero-vote tail-cull and an admin-driven "advance the round" that keeps
-- the top-N by votes (lowest-voted cut, ties broken by earliest-suggested).
--
-- Culls are PERMANENT — a non-restorable `culled_at`, deliberately distinct from
-- `rsvp_hidden_at` (un-RSVP, restorable) and `deleted` (admin moderation) so the
-- three reasons compose. A culled title's votes stop counting toward its voters'
-- per-event budget (the tally + limit triggers exclude culled), so those votes are
-- automatically refunded — voters can re-spend them on the survivors.
--
-- The cull RPCs are admin-only (SECURITY DEFINER + is_admin guard). They're also
-- the seam a future scheduled job (pg_cron / Vercel cron) can call to automate the
-- T-7 zero-vote cull; for now an admin triggers them from the Suggestions tab.
-- ============================================================================

alter table public.suggestions add column if not exists culled_at timestamptz;

-- ---------- Read paths: a culled title is off the ballot everywhere ----------
-- Tally counts only live votes on on-ballot suggestions.
create or replace function public.suggestion_vote_counts(p_event_id uuid)
  returns table (suggestion_id uuid, votes bigint)
  language sql security definer stable set search_path = public as $$
  select v.suggestion_id, count(*)::bigint
  from public.votes v
  join public.suggestions s on s.id = v.suggestion_id
  where s.event_id = p_event_id and s.deleted = false and s.rsvp_hidden_at is null
    and s.culled_at is null and v.hidden_at is null
    and public.is_allowed()
  group by v.suggestion_id
$$;
revoke all on function public.suggestion_vote_counts(uuid) from public;
grant execute on function public.suggestion_vote_counts(uuid) to authenticated;

-- Limits ignore culled rows too: a culled suggestion frees its author's slot, and
-- a vote on a culled title no longer counts against the voter's budget (the refund).
create or replace function public.enforce_suggestion_limit() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and (
    select count(*) from public.suggestions
    where event_id = new.event_id and user_id = auth.uid()
      and deleted = false and rsvp_hidden_at is null and culled_at is null
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
      and s.deleted = false and s.rsvp_hidden_at is null and s.culled_at is null
      and v.hidden_at is null
  ) >= public.vote_limit() then
    raise exception 'Vote limit (%) reached for this event', public.vote_limit()
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

-- ---------- Cull RPCs (admin-only) ----------
-- Both only ever touch on-ballot rows (not already deleted / rsvp-hidden / culled)
-- and stamp culled_at = now(). Returns the number of titles cut.

-- Zero-vote tail-cull: drop every title with no live votes.
create function public.cull_zero_votes(p_event_id uuid) returns integer
  language plpgsql security definer set search_path = public as $$
declare
  culled integer;
begin
  if not public.is_admin() then
    raise exception 'only admins may prune the ballot';
  end if;
  with on_ballot as (
    select s.id, count(v.suggestion_id) filter (where v.hidden_at is null) as votes
    from public.suggestions s
    left join public.votes v on v.suggestion_id = s.id
    where s.event_id = p_event_id and s.deleted = false
      and s.rsvp_hidden_at is null and s.culled_at is null
    group by s.id
  )
  update public.suggestions
    set culled_at = now()
    where id in (select id from on_ballot where votes = 0);
  get diagnostics culled = row_count;
  return culled;
end;
$$;
revoke all on function public.cull_zero_votes(uuid) from public;
grant execute on function public.cull_zero_votes(uuid) to authenticated;

-- Runoff: keep the top p_keep by live votes (ties → earliest-suggested), cull the rest.
create function public.cull_to_top(p_event_id uuid, p_keep integer) returns integer
  language plpgsql security definer set search_path = public as $$
declare
  culled integer;
begin
  if not public.is_admin() then
    raise exception 'only admins may prune the ballot';
  end if;
  if p_keep < 0 then
    raise exception 'keep count must be >= 0';
  end if;
  with ranked as (
    select s.id,
      row_number() over (
        order by count(v.suggestion_id) filter (where v.hidden_at is null) desc, s.created_at asc
      ) as rk
    from public.suggestions s
    left join public.votes v on v.suggestion_id = s.id
    where s.event_id = p_event_id and s.deleted = false
      and s.rsvp_hidden_at is null and s.culled_at is null
    group by s.id, s.created_at
  )
  update public.suggestions
    set culled_at = now()
    where id in (select id from ranked where rk > p_keep);
  get diagnostics culled = row_count;
  return culled;
end;
$$;
revoke all on function public.cull_to_top(uuid, integer) from public;
grant execute on function public.cull_to_top(uuid, integer) to authenticated;
