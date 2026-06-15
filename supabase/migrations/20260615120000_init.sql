-- ============================================================================
-- Benteen Screen On The Green — initial schema, RLS, triggers, realtime.
-- Movie-night voting: profiles, events, suggestions, and normalized votes.
--
-- Apply with the Supabase CLI (`supabase db push`) or paste into the SQL editor.
-- RLS is the authorization boundary (it replaces the old firestore.rules).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Tables
-- ----------------------------------------------------------------------------

-- profiles: one row per auth user, auto-created on signup (see handle_new_user).
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  email        text,
  display_name text,
  avatar_url   text,
  is_admin     boolean not null default false,
  created_at   timestamptz not null default now()
);

-- events: a scheduled movie night.
create table public.events (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  description text not null default '',
  event_date  timestamptz not null,
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);
create index events_event_date_idx on public.events (event_date);

-- suggestions: a movie nominated for an event. tmdb_movie is the TMDB payload.
create table public.suggestions (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references public.events (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  tmdb_movie jsonb not null,
  deleted    boolean not null default false,
  created_at timestamptz not null default now()
);
create index suggestions_event_id_idx on public.suggestions (event_id);
-- A movie can only be suggested once per event (ignoring soft-deleted rows).
create unique index suggestions_event_movie_unique
  on public.suggestions (event_id, ((tmdb_movie ->> 'id')))
  where deleted = false;

-- votes: normalized — one row per (suggestion, user). The composite PK enforces
-- "one vote per user per suggestion"; the vote count is just count(votes). This
-- makes the old Firestore votesCount/votes[] drift impossible by construction.
create table public.votes (
  suggestion_id uuid not null references public.suggestions (id) on delete cascade,
  user_id       uuid not null references public.profiles (id) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (suggestion_id, user_id)
);
create index votes_user_id_idx on public.votes (user_id);

-- ----------------------------------------------------------------------------
-- Helpers
-- ----------------------------------------------------------------------------

-- Per-event participation limits. Keep in sync with app/utils/limits.ts.
create function public.suggestion_limit() returns int language sql immutable as $$ select 5 $$;
create function public.vote_limit() returns int language sql immutable as $$ select 3 $$;

-- Admin check. SECURITY DEFINER so it bypasses RLS on profiles (avoids recursion).
create function public.is_admin() returns boolean
  language sql security definer stable set search_path = public as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

-- ----------------------------------------------------------------------------
-- Triggers
-- ----------------------------------------------------------------------------

-- Create a profile row from Google OAuth metadata when a user first signs up.
create function public.handle_new_user() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, display_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', new.email),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Enforce the per-event suggestion limit for authenticated users. Skipped when
-- auth.uid() is null (service-role / migration inserts) so historical data that
-- predates the limit can be imported.
create function public.enforce_suggestion_limit() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and (
    select count(*) from public.suggestions
    where event_id = new.event_id and user_id = new.user_id and deleted = false
  ) >= public.suggestion_limit() then
    raise exception 'Suggestion limit (%) reached for this event', public.suggestion_limit()
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger enforce_suggestion_limit_trigger
  before insert on public.suggestions
  for each row execute function public.enforce_suggestion_limit();

-- Enforce the per-event vote limit server-side (votes carry no event_id, so we
-- resolve it through the suggestion).
create function public.enforce_vote_limit() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  ev uuid;
begin
  select event_id into ev from public.suggestions where id = new.suggestion_id;
  if auth.uid() is not null and (
    select count(*) from public.votes v
    join public.suggestions s on s.id = v.suggestion_id
    where v.user_id = new.user_id and s.event_id = ev
  ) >= public.vote_limit() then
    raise exception 'Vote limit (%) reached for this event', public.vote_limit()
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger enforce_vote_limit_trigger
  before insert on public.votes
  for each row execute function public.enforce_vote_limit();

-- ----------------------------------------------------------------------------
-- Row Level Security  (the authorization boundary)
-- ----------------------------------------------------------------------------

alter table public.profiles    enable row level security;
alter table public.events      enable row level security;
alter table public.suggestions enable row level security;
alter table public.votes       enable row level security;

grant usage on schema public to authenticated;
grant select, insert, update, delete on
  public.profiles, public.events, public.suggestions, public.votes to authenticated;

-- profiles -------------------------------------------------------------------
create policy "profiles: read" on public.profiles
  for select to authenticated using (true);
create policy "profiles: insert own" on public.profiles
  for insert to authenticated with check (id = auth.uid());
-- Users may edit their own profile but cannot grant themselves admin (the new
-- is_admin must equal their current one). Admin is assigned out-of-band via SQL.
create policy "profiles: update own" on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and is_admin = public.is_admin());
create policy "profiles: delete own" on public.profiles
  for delete to authenticated using (id = auth.uid());

-- events ---------------------------------------------------------------------
create policy "events: read" on public.events
  for select to authenticated using (true);
create policy "events: admin insert" on public.events
  for insert to authenticated with check (public.is_admin());
create policy "events: admin update" on public.events
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "events: admin delete" on public.events
  for delete to authenticated using (public.is_admin());

-- suggestions ----------------------------------------------------------------
create policy "suggestions: read" on public.suggestions
  for select to authenticated using (true);
create policy "suggestions: create own" on public.suggestions
  for insert to authenticated with check (user_id = auth.uid() and deleted = false);
-- Only admins update suggestions (moderation: toggle `deleted`).
create policy "suggestions: admin update" on public.suggestions
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
-- The author may hard-delete their own; admins may delete any.
create policy "suggestions: author or admin delete" on public.suggestions
  for delete to authenticated using (user_id = auth.uid() or public.is_admin());

-- votes ----------------------------------------------------------------------
create policy "votes: read" on public.votes
  for select to authenticated using (true);
create policy "votes: insert own" on public.votes
  for insert to authenticated with check (user_id = auth.uid());
create policy "votes: delete own" on public.votes
  for delete to authenticated using (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- Realtime — stream changes to clients (gated by the SELECT policies above).
-- ----------------------------------------------------------------------------
alter publication supabase_realtime add table public.events;
alter publication supabase_realtime add table public.suggestions;
alter publication supabase_realtime add table public.votes;
