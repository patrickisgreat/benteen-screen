-- ============================================================================
-- RSVP reminder infrastructure. A daily cron emails invitees who haven't replied
-- yet, on admin-configurable "checkpoint" days before the event.
--
--  * event_invites.reminded_at — last reminder send, to throttle (one per day max).
--  * app_settings.reminder_days — the configurable checkpoints (days before the
--    event to send), default {7,3,1}. Empty array = reminders off globally.
--  * events.reminders_enabled — per-event off switch (on by default).
--  * comms_log.kind gains 'reminder' so reminder batches are logged like the rest.
-- ============================================================================

alter table public.event_invites add column if not exists reminded_at timestamptz;

alter table public.app_settings
  add column if not exists reminder_days int[] not null default '{7,3,1}';

alter table public.events
  add column if not exists reminders_enabled boolean not null default true;

alter table public.comms_log drop constraint if exists comms_log_kind_check;
alter table public.comms_log
  add constraint comms_log_kind_check check (kind in ('announcement', 'invite', 'reminder'));
