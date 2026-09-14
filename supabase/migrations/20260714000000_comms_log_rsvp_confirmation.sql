-- ============================================================================
-- Log RSVP confirmations in the Comms log.
--
-- When an admin RSVPs on a guest's behalf they can email that guest a
-- confirmation ("Pat marked you as going +2 — change it here if that's wrong").
-- Every email the app sends on an admin's behalf is recorded in comms_log, so
-- the kind check gains 'rsvp_confirmation'. Mirrored in useCommsLog's KINDS and
-- the CommsLog label map — keep the three in sync.
-- ============================================================================

alter table public.comms_log drop constraint if exists comms_log_kind_check;
alter table public.comms_log
  add constraint comms_log_kind_check check (kind in ('announcement', 'invite', 'reminder', 'rsvp_confirmation'));
