-- ============================================================================
-- Evite-style per-event invitations + tracking. One row per (event, email):
-- the admin-curated guest list for an event, a unique token for one-click RSVP
-- from the email, the RSVP itself, and engagement timestamps fed by Resend
-- webhooks. Admins curate; the public RSVP + webhook routes update below RLS via
-- the service role (Invariant 1 holds — only admins can read/write directly).
-- ============================================================================

create table public.event_invites (
  id            uuid primary key default gen_random_uuid(),
  event_id      uuid not null references public.events (id) on delete cascade,
  email         text not null,
  display_name  text,
  -- Opaque, unguessable token for the one-click RSVP link (DB-generated).
  token         text not null unique default encode(gen_random_bytes(16), 'hex'),
  rsvp          text check (rsvp in ('going', 'maybe', 'no')),
  rsvp_at       timestamptz,
  invited_by    uuid references public.profiles (id) on delete set null,
  -- Engagement (stamped by the Resend webhook), keyed on the Resend message id.
  resend_id     text,
  sent_at       timestamptz,
  delivered_at  timestamptz,
  opened_at     timestamptz,
  clicked_at    timestamptz,
  bounced_at    timestamptz,
  created_at    timestamptz not null default now(),
  unique (event_id, email)
);
create index event_invites_event_id_idx on public.event_invites (event_id);
create index event_invites_resend_id_idx on public.event_invites (resend_id);

-- Normalize the email key (reuses the invites normalizer).
create trigger event_invites_normalize_email before insert or update on public.event_invites
  for each row execute function public.normalize_invite_email();

alter table public.event_invites enable row level security;
grant select, insert, update, delete on public.event_invites to authenticated;
grant select, insert, update, delete on public.event_invites to service_role;

-- Admin-only direct access: only admins curate the guest list and see tracking.
-- The public RSVP page and the Resend webhook update via the service role, which
-- bypasses RLS — they authenticate by token / signature instead.
create policy "event_invites: admin all" on public.event_invites
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Live tracker updates.
alter publication supabase_realtime add table public.event_invites;
