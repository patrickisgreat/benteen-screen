-- ============================================================================
-- Guest polls: ask an event's guest list a question ("should we move to
-- Saturday?") and let each guest answer with one tap from the email — no
-- sign-in, authenticated by their e-vite token like the one-click RSVP.
--
--   polls         — one question about one event; `closed_at` stops voting.
--   poll_options  — its choices, in display order.
--   poll_votes    — one row per (poll, guest): the composite PK makes "one vote
--                   per guest per poll" structural (same shape as public.votes,
--                   Invariant 3), and a re-vote is an update, not a second row.
--
-- Admin-only under RLS (Invariant 1): admins create polls and read results from
-- their own session. Guests never touch these tables directly — the public vote
-- route verifies their token and writes as the service role, below RLS.
-- ============================================================================

create table public.polls (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.events (id) on delete cascade,
  question    text not null check (char_length(btrim(question)) between 1 and 200),
  closed_at   timestamptz,
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);
create index polls_event_id_idx on public.polls (event_id, created_at desc);

create table public.poll_options (
  id        uuid primary key default gen_random_uuid(),
  poll_id   uuid not null references public.polls (id) on delete cascade,
  label     text not null check (char_length(btrim(label)) between 1 and 80),
  position  int not null,
  unique (poll_id, position),
  -- Target of poll_votes' composite FK: a vote's option must belong to its poll.
  unique (poll_id, id)
);

create table public.poll_votes (
  poll_id    uuid not null references public.polls (id) on delete cascade,
  invite_id  uuid not null references public.event_invites (id) on delete cascade,
  option_id  uuid not null,
  voted_at   timestamptz not null default now(),
  primary key (poll_id, invite_id),
  foreign key (poll_id, option_id) references public.poll_options (poll_id, id) on delete cascade
);
create index poll_votes_invite_id_idx on public.poll_votes (invite_id);

-- A vote must come from a guest of the poll's own event, while the poll is open.
-- Enforced here (not only in the route) so no writer — service role included —
-- can record a vote from another event's guest or into a closed poll.
create function public.poll_vote_guard() returns trigger
language plpgsql set search_path = public as $$
declare
  v_event_id   uuid;
  v_closed_at  timestamptz;
  v_guest_event uuid;
begin
  select event_id, closed_at into v_event_id, v_closed_at from public.polls where id = new.poll_id;
  select event_id into v_guest_event from public.event_invites where id = new.invite_id;
  if v_guest_event is distinct from v_event_id then
    raise exception 'That guest is not on this poll''s guest list' using errcode = '23514';
  end if;
  if v_closed_at is not null then
    raise exception 'This poll is closed' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger poll_votes_guard
  before insert or update on public.poll_votes
  for each row execute function public.poll_vote_guard();

alter table public.polls enable row level security;
alter table public.poll_options enable row level security;
alter table public.poll_votes enable row level security;

grant select, insert, update, delete on public.polls, public.poll_options, public.poll_votes to authenticated;
grant select, insert, update, delete on public.polls, public.poll_options, public.poll_votes to service_role;

create policy "polls: admin all" on public.polls
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "poll_options: admin all" on public.poll_options
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "poll_votes: admin all" on public.poll_votes
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Live results in the admin Comms tab.
alter publication supabase_realtime add table public.polls;
alter publication supabase_realtime add table public.poll_votes;

-- A poll email is logged and tracked like every other send.
alter table public.comms_log drop constraint if exists comms_log_kind_check;
alter table public.comms_log
  add constraint comms_log_kind_check check (kind in ('announcement', 'invite', 'reminder', 'rsvp_confirmation', 'poll'));
alter table public.email_messages drop constraint if exists email_messages_kind_check;
alter table public.email_messages
  add constraint email_messages_kind_check check (kind in ('announcement', 'invite', 'reminder', 'rsvp_confirmation', 'poll'));
