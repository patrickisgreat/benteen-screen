-- ============================================================================
-- "You've got a vote back" notices. When a movie a member voted for leaves the
-- ballot — culled (pruning) or rsvp-hidden (its suggester left "going") — that
-- member's vote is refunded: it stops counting toward their budget so they can
-- re-spend it. Tell them, once.
--
-- claim_freed_votes returns the member's freed-but-unacknowledged picks for an
-- event AND records the acknowledgment in the same call, so the nudge never nags
-- again. Derived from current state (not stored events), so if an rsvp-hidden pick
-- is later restored before the member ever sees it, no stale notice fires.
-- ============================================================================

create table public.vote_refund_acks (
  user_id       uuid not null references public.profiles (id) on delete cascade,
  suggestion_id uuid not null references public.suggestions (id) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (user_id, suggestion_id)
);
-- RLS on with no policies: only the SECURITY DEFINER RPC below ever touches this.
alter table public.vote_refund_acks enable row level security;

create function public.claim_freed_votes(p_event_id uuid)
  returns table (suggestion_id uuid, title text)
  language sql security definer set search_path = public volatile as $$
  with freed as (
    select v.suggestion_id, s.tmdb_movie ->> 'title' as title
    from public.votes v
    join public.suggestions s on s.id = v.suggestion_id
    join public.events e on e.id = s.event_id
    where s.event_id = p_event_id
      and v.user_id = auth.uid()
      and v.hidden_at is null                                       -- my vote is still live
      and (s.culled_at is not null or s.rsvp_hidden_at is not null) -- but the pick left the ballot
      and e.voting_locked_at is null                               -- and I can still re-spend
      and not exists (
        select 1 from public.vote_refund_acks a
        where a.user_id = auth.uid() and a.suggestion_id = v.suggestion_id
      )
  ),
  ack as (
    insert into public.vote_refund_acks (user_id, suggestion_id)
    select auth.uid(), suggestion_id from freed
    on conflict do nothing
  )
  select suggestion_id, title from freed;
$$;
revoke all on function public.claim_freed_votes(uuid) from public;
grant execute on function public.claim_freed_votes(uuid) to authenticated;
