-- ============================================================================
-- Event-day features: logistics fields, RSVPs, and a potluck "bring list".
-- ============================================================================

-- ---------- Event logistics + poster ----------
alter table public.events add column if not exists start_time   text;  -- e.g. "7:30 PM"
alter table public.events add column if not exists location     text;
alter table public.events add column if not exists location_url text;  -- map link
alter table public.events add column if not exists poster_url   text;  -- event poster image

-- Public storage bucket for event posters; only admins may upload/replace.
-- Restrict to raster images (no SVG → no scriptable upload) and cap the size.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'event-posters', 'event-posters', true,
  5242880, -- 5 MB
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
on conflict (id) do nothing;

create policy "event-posters: public read" on storage.objects
  for select using (bucket_id = 'event-posters');
create policy "event-posters: admin insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'event-posters' and public.is_admin());
create policy "event-posters: admin update" on storage.objects
  for update to authenticated using (bucket_id = 'event-posters' and public.is_admin());
create policy "event-posters: admin delete" on storage.objects
  for delete to authenticated using (bucket_id = 'event-posters' and public.is_admin());

-- ---------- RSVPs ----------
create table public.rsvps (
  event_id   uuid not null references public.events (id) on delete cascade,
  user_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  status     text not null check (status in ('going', 'maybe', 'no')),
  updated_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

-- ---------- Bring list (potluck) ----------
-- Each row is something to bring; user_id null = an open slot anyone can claim.
create table public.bring_items (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references public.events (id) on delete cascade,
  label      text not null,
  note       text,
  user_id    uuid references public.profiles (id) on delete set null,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index bring_items_event_id_idx on public.bring_items (event_id);

-- ---------- RLS ----------
alter table public.rsvps       enable row level security;
alter table public.bring_items enable row level security;
grant select, insert, update, delete on public.rsvps, public.bring_items to authenticated;

-- rsvps: everyone sees the headcount; you manage only your own row.
create policy "rsvps: read" on public.rsvps for select to authenticated using (true);
create policy "rsvps: insert own" on public.rsvps for insert to authenticated with check (user_id = auth.uid());
create policy "rsvps: update own" on public.rsvps for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "rsvps: delete own" on public.rsvps for delete to authenticated using (user_id = auth.uid());

-- bring_items: read all; create as self; claim an open slot or edit your own; delete your own (or admin).
-- A row may only ever be unclaimed or claimed by the acting user — you can never
-- assign an item to another person's profile (the WITH CHECK is the boundary).
create policy "bring: read" on public.bring_items for select to authenticated using (true);
create policy "bring: create" on public.bring_items for insert to authenticated
  with check (created_by = auth.uid() and (user_id is null or user_id = auth.uid()));
create policy "bring: update" on public.bring_items for update to authenticated
  using (created_by = auth.uid() or user_id = auth.uid() or user_id is null)
  with check (user_id is null or user_id = auth.uid());
create policy "bring: delete" on public.bring_items for delete to authenticated
  using (created_by = auth.uid() or user_id = auth.uid() or public.is_admin());

-- ---------- Realtime ----------
alter publication supabase_realtime add table public.rsvps;
alter publication supabase_realtime add table public.bring_items;
