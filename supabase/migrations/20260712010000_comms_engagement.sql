-- Comms log click-through: store what was actually sent and track per-recipient
-- engagement, so an admin can open a log entry and see the full message plus
-- delivered / opened / clicked counts.
--
-- Announcements previously went out as BCC groups with no per-recipient record,
-- which made engagement untrackable (one Resend message id for 49 hidden
-- recipients). The announce route now sends one email per recipient via the
-- batch endpoint (addresses stay private — each guest sees only their own) and
-- records a comms_recipients row per accepted send. The Resend webhook stamps
-- delivered/opened/clicked/bounced on those rows by message id, exactly like it
-- already does for event_invites.

-- The rich HTML that went out (null for sends made before this migration).
alter table public.comms_log add column body text;

create table public.comms_recipients (
  id            uuid primary key default gen_random_uuid(),
  comms_log_id  uuid not null references public.comms_log (id) on delete cascade,
  email         text not null,
  resend_id     text,
  sent_at       timestamptz not null default now(),
  delivered_at  timestamptz,
  opened_at     timestamptz,
  clicked_at    timestamptz,
  bounced_at    timestamptz
);
create index comms_recipients_log_id_idx on public.comms_recipients (comms_log_id);
create index comms_recipients_resend_id_idx on public.comms_recipients (resend_id);

alter table public.comms_recipients enable row level security;
grant select, insert on public.comms_recipients to authenticated;

-- Admin-only, like comms_log: recipient emails + engagement are operator data.
-- The announce route inserts under the admin's own session; the webhook updates
-- via the service role (below RLS), so authenticated needs no update grant.
create policy "comms_recipients: admin read" on public.comms_recipients
  for select to authenticated using (public.is_admin());
create policy "comms_recipients: admin insert" on public.comms_recipients
  for insert to authenticated with check (public.is_admin());

-- Stream webhook engagement stamps into the open detail modal live.
alter publication supabase_realtime add table public.comms_recipients;
