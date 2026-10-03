-- ============================================================================
-- Per-recipient delivery log: one row per email the app hands to Resend.
--
-- Until now only the e-vite carried tracking, as a single `resend_id` on the
-- guest's event_invites row. Reminders reused that row but never stored their
-- own message id, and announcements were BCC'd in groups (one message id for 49
-- people), so opens for either could not be attributed to anyone. This table
-- gives every send — e-vite, reminder, announcement, RSVP confirmation — the
-- same per-recipient treatment:
--   * resend_id     — the Resend message id; the Resend webhook and the pull-based
--                     status sync both key on it.
--   * comms_log_id  — the send it belongs to, so the Comms log can show
--                     delivered/opened counts per blast.
--   * invite_id     — the guest it was about, when they are on the event's guest
--                     list; a trigger copies engagement onto that event_invites
--                     row so the guest list keeps reading one place.
--
-- Admin-only under RLS (Invariant 1): the rows reveal who was emailed and who
-- opened. Routes write as the signed-in admin; the webhook and crons write as
-- the service role, below RLS.
-- ============================================================================

create table public.email_messages (
  id            uuid primary key default gen_random_uuid(),
  resend_id     text not null unique,
  event_id      uuid references public.events (id) on delete cascade,
  comms_log_id  uuid references public.comms_log (id) on delete cascade,
  invite_id     uuid references public.event_invites (id) on delete set null,
  kind          text not null check (kind in ('announcement', 'invite', 'reminder', 'rsvp_confirmation')),
  email         text not null,
  sent_at       timestamptz not null default now(),
  delivered_at  timestamptz,
  opened_at     timestamptz,
  clicked_at    timestamptz,
  bounced_at    timestamptz
);

create index email_messages_event_id_idx on public.email_messages (event_id, sent_at desc);
create index email_messages_comms_log_id_idx on public.email_messages (comms_log_id);
create index email_messages_invite_id_idx on public.email_messages (invite_id);

alter table public.email_messages enable row level security;
grant select, insert, update on public.email_messages to authenticated;
grant select, insert, update, delete on public.email_messages to service_role;

create policy "email_messages: admin read" on public.email_messages
  for select to authenticated using (public.is_admin());
create policy "email_messages: admin insert" on public.email_messages
  for insert to authenticated with check (public.is_admin());
create policy "email_messages: admin update" on public.email_messages
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- Copy a message's engagement onto its guest row. The guest list reads
-- event_invites, so any email about the night (e-vite, reminder, announcement)
-- marks the guest delivered/opened. First stamp wins — a later reminder must not
-- move "opened" forward. Runs as the caller: an admin has `event_invites: admin
-- all`, and the service role is below RLS.
create function public.sync_invite_from_email_message() returns trigger
language plpgsql set search_path = public as $$
begin
  update public.event_invites
  set delivered_at = coalesce(delivered_at, new.delivered_at),
      opened_at    = coalesce(opened_at, new.opened_at),
      clicked_at   = coalesce(clicked_at, new.clicked_at),
      bounced_at   = coalesce(bounced_at, new.bounced_at)
  where id = new.invite_id;
  return new;
end;
$$;

create trigger email_messages_sync_invite
  after update of delivered_at, opened_at, clicked_at, bounced_at on public.email_messages
  for each row when (new.invite_id is not null)
  execute function public.sync_invite_from_email_message();

-- Live delivered/opened counts in the admin Comms log.
alter publication supabase_realtime add table public.email_messages;

-- Backfill: every e-vite already sent has its Resend id on the guest row. Seed a
-- message row for each so the status sync can recover delivery/opens for sends
-- that predate this table (as far back as Resend still retains them).
insert into public.email_messages
  (resend_id, event_id, invite_id, kind, email, sent_at, delivered_at, opened_at, clicked_at, bounced_at)
select resend_id, event_id, id, 'invite', email, coalesce(sent_at, created_at),
       delivered_at, opened_at, clicked_at, bounced_at
from public.event_invites
where resend_id is not null
on conflict (resend_id) do nothing;

-- Attach each backfilled e-vite to its blast. The invite route stamps `sent_at`
-- and then writes the comms_log row, so the log entry is the first 'invite' row
-- for the event shortly after the send.
update public.email_messages m
set comms_log_id = (
  select c.id
  from public.comms_log c
  where c.event_id = m.event_id
    and c.kind = 'invite'
    and c.created_at >= m.sent_at
    and c.created_at < m.sent_at + interval '5 minutes'
  order by c.created_at
  limit 1
)
where m.comms_log_id is null;
