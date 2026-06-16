-- ============================================================================
-- Invite-only access. The app is now a closed guest list: a user may read or
-- write anything only if their email is on the allowlist (public.invites) or
-- they're an admin. RLS is the boundary (Invariant 1); the client middleware
-- (app/middleware/invited.global.ts) is just the UX half — it signs out and
-- redirects anyone who slips past.
--
-- Provider-agnostic: the gate keys on the profile email, so Google, email/
-- password, and Facebook sign-ins all flow through the same check.
-- ============================================================================

-- ---------- Allowlist table ----------
-- One row per invited email (the natural key). A row with accepted_at set means
-- that person has since signed in. invited_by is null for the bootstrap seed.
create table public.invites (
  email        text primary key,
  invited_by   uuid references public.profiles (id) on delete set null,
  display_name text,
  created_at   timestamptz not null default now(),
  accepted_at  timestamptz
);

-- Normalize the key so casing/whitespace can't create duplicate or missed
-- invites (BobX@x.com and bobx@x.com must be the same allowlist entry).
create function public.normalize_invite_email() returns trigger
  language plpgsql set search_path = '' as $$
begin
  new.email := lower(trim(new.email));
  return new;
end;
$$;
create trigger invites_normalize_email before insert or update on public.invites
  for each row execute function public.normalize_invite_email();

-- ---------- Allowlist check ----------
-- True if the current user is an admin or their email is on the allowlist.
-- SECURITY DEFINER (search_path = '') so it bypasses RLS on profiles/invites and
-- can't recurse — mirrors public.is_admin() / public.is_blocked().
create function public.is_allowed() returns boolean
  language sql security definer set search_path = '' stable as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and (
        p.is_admin
        or exists (
          select 1 from public.invites i where i.email = lower(trim(p.email))
        )
      )
  );
$$;
revoke all on function public.is_allowed() from public;
grant execute on function public.is_allowed() to authenticated;

-- ---------- Seed existing members so nobody is locked out ----------
-- Everyone who already has a profile is grandfathered onto the allowlist and
-- marked accepted. Runs before the cap trigger exists (and these are system
-- invites with invited_by null, which the cap exempts anyway).
insert into public.invites (email, accepted_at)
select distinct lower(trim(email)), now()
from public.profiles
where email is not null and trim(email) <> ''
on conflict (email) do nothing;

-- ---------- App settings (admin-tunable, single row) ----------
-- max_invites caps the TOTAL allowlist size (null = unlimited). Admins set it
-- from the command center; the invite cap trigger reads it.
create table public.app_settings (
  id          boolean primary key default true check (id), -- single-row guard
  max_invites int check (max_invites is null or max_invites >= 0), -- guard fat-fingers
  updated_at  timestamptz not null default now()
);
insert into public.app_settings (id) values (true) on conflict (id) do nothing;

alter table public.app_settings enable row level security;
grant select, update on public.app_settings to authenticated;
-- The cap number isn't sensitive — any authenticated user can read it (so the
-- invite UI can show "X of Y invites used"); only admins may change it.
create policy "app_settings: read" on public.app_settings
  for select to authenticated using (true);
create policy "app_settings: admin update" on public.app_settings
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------- Total invite cap ----------
-- Any member may invite friends, but the total allowlist can't exceed the
-- admin-set max_invites. Admins and the system seed (invited_by null) are exempt.
create function public.enforce_invite_cap() returns trigger
  language plpgsql security definer set search_path = '' as $$
declare
  cap   int;
  total int;
begin
  if new.invited_by is null or public.is_admin() then
    return new;
  end if;
  select max_invites into cap from public.app_settings where id;
  if cap is not null then
    select count(*) into total from public.invites;
    if total >= cap then
      raise exception 'Total invite limit (%) reached', cap using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;
create trigger invites_cap before insert on public.invites
  for each row execute function public.enforce_invite_cap();

-- ---------- Mark invites accepted on first sign-in ----------
-- Recreates handle_new_user to also flip accepted_at when an invited email joins.
-- A non-invited user still gets a profile row (the trigger always creates one),
-- but is_allowed() stays false for them, so RLS denies everything and the client
-- gate bounces them to /request-access.
create or replace function public.handle_new_user() returns trigger
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

  update public.invites
    set accepted_at = now()
    where email = lower(trim(new.email)) and accepted_at is null;

  return new;
end;
$$;

-- ---------- RLS on invites ----------
alter table public.invites enable row level security;
grant select, insert, update, delete on public.invites to authenticated;

-- Allowlisted members (and admins) can see the guest list — this powers the
-- admin people directory (members + pending invites).
create policy "invites: read" on public.invites
  for select to authenticated using (public.is_allowed());

-- Any allowlisted, non-blocked member may invite a friend, as themselves. The
-- per-member cap is enforced by the invites_cap trigger above.
create policy "invites: create" on public.invites
  for insert to authenticated
  with check (invited_by = auth.uid() and public.is_allowed() and not public.is_blocked());

-- Admins may edit any invite (e.g. fix a name); members may not.
create policy "invites: admin update" on public.invites
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- An inviter may withdraw an invite they sent that hasn't been accepted yet;
-- admins may remove any.
create policy "invites: delete" on public.invites
  for delete to authenticated
  using (public.is_admin() or (invited_by = auth.uid() and accepted_at is null));

-- ----------------------------------------------------------------------------
-- Gate every existing table on the allowlist. READ is closed to allowlisted
-- users only (a non-invited session sees nothing); PARTICIPATION writes add the
-- same check alongside the existing not-blocked guard. Reductive self-deletes
-- stay open, same as the blocking migration.
-- ----------------------------------------------------------------------------

-- profiles: you can always read your OWN row (so the gate can learn you're not
-- invited); reading anyone else requires being allowlisted.
drop policy "profiles: read" on public.profiles;
create policy "profiles: read" on public.profiles
  for select to authenticated using (id = auth.uid() or public.is_allowed());

drop policy "events: read" on public.events;
create policy "events: read" on public.events
  for select to authenticated using (public.is_allowed());

drop policy "suggestions: read" on public.suggestions;
create policy "suggestions: read" on public.suggestions
  for select to authenticated using (public.is_allowed());

drop policy "votes: read" on public.votes;
create policy "votes: read" on public.votes
  for select to authenticated using (public.is_allowed());

drop policy "rsvps: read" on public.rsvps;
create policy "rsvps: read" on public.rsvps
  for select to authenticated using (public.is_allowed());

drop policy "bring: read" on public.bring_items;
create policy "bring: read" on public.bring_items
  for select to authenticated using (public.is_allowed());

-- Participation writes: must be allowlisted (and not blocked).
drop policy "suggestions: create own" on public.suggestions;
create policy "suggestions: create own" on public.suggestions
  for insert to authenticated
  with check (user_id = auth.uid() and deleted = false and public.is_allowed() and not public.is_blocked());

drop policy "votes: insert own" on public.votes;
create policy "votes: insert own" on public.votes
  for insert to authenticated
  with check (user_id = auth.uid() and public.is_allowed() and not public.is_blocked());

drop policy "rsvps: insert own" on public.rsvps;
create policy "rsvps: insert own" on public.rsvps
  for insert to authenticated
  with check (user_id = auth.uid() and public.is_allowed() and not public.is_blocked());

drop policy "rsvps: update own" on public.rsvps;
create policy "rsvps: update own" on public.rsvps
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.is_allowed() and not public.is_blocked());

drop policy "bring: create" on public.bring_items;
create policy "bring: create" on public.bring_items
  for insert to authenticated
  with check (created_by = auth.uid() and (user_id is null or user_id = auth.uid()) and public.is_allowed() and not public.is_blocked());

drop policy "bring: update" on public.bring_items;
create policy "bring: update" on public.bring_items
  for update to authenticated
  using (created_by = auth.uid() or user_id = auth.uid() or user_id is null)
  with check ((user_id is null or user_id = auth.uid()) and public.is_allowed() and not public.is_blocked());

-- ---------- Realtime ----------
alter publication supabase_realtime add table public.invites;
