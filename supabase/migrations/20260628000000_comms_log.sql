-- Communications log — an admin-visible record of every blast sent from the app, so
-- the Comms tab can show "what went out, to whom, when". Today announcements vanish
-- after sending (the route just returns a count); this persists them, plus invite
-- blasts, as a lightweight audit trail.
--
-- One row per send (not per recipient — per-recipient delivery/opens already live on
-- event_invites). Written by the announce + invite routes, which run under the admin's
-- own session, so the admin-only RLS insert policy covers them (no service role).

create table public.comms_log (
  id              uuid primary key default gen_random_uuid(),
  event_id        uuid references public.events (id) on delete cascade,
  kind            text not null check (kind in ('announcement', 'invite')),
  -- Announcement audience (members | going | invited); null for invite blasts.
  scope           text,
  subject         text,
  recipient_count int not null default 0,
  sent_by         uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now()
);

create index comms_log_event_id_idx on public.comms_log (event_id, created_at desc);

alter table public.comms_log enable row level security;
grant select, insert on public.comms_log to authenticated;

-- Admin-only: the log can reveal the audience/subject of every blast.
create policy "comms_log: admin read" on public.comms_log
  for select to authenticated using (public.is_admin());
create policy "comms_log: admin insert" on public.comms_log
  for insert to authenticated with check (public.is_admin());

-- Stream new entries to the admin Comms tab live.
alter publication supabase_realtime add table public.comms_log;
