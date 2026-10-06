-- ============================================================================
-- Moving an event's date.
--
-- When an admin reschedules a movie night, remember where it moved from so the
-- app can say "New date — was Friday, October 17" and the notice email can show
-- old → new. RSVPs are deliberately left alone: everyone keeps their reply and
-- changes it only if the new date doesn't work.
--
--   previous_event_date / previous_start_time — what it was before the most
--       recent move (only one step of history; a second move overwrites it).
--   rescheduled_at — when that move happened; null = never moved.
--
-- No policy change: these are ordinary event columns — readable by members like
-- the rest of the row, writable only by admins (`events` update policy).
-- ============================================================================

alter table public.events
  add column if not exists previous_event_date timestamptz,
  add column if not exists previous_start_time text,
  add column if not exists rescheduled_at timestamptz;

-- The date-change notice is logged and tracked like every other send.
alter table public.comms_log drop constraint if exists comms_log_kind_check;
alter table public.comms_log
  add constraint comms_log_kind_check check (kind in ('announcement', 'invite', 'reminder', 'rsvp_confirmation', 'poll', 'date_change'));
alter table public.email_messages drop constraint if exists email_messages_kind_check;
alter table public.email_messages
  add constraint email_messages_kind_check check (kind in ('announcement', 'invite', 'reminder', 'rsvp_confirmation', 'poll', 'date_change'));
