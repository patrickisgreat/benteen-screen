-- ============================================================================
-- Give the comms log an outcome, so admins can see whether a send succeeded.
--
-- Reminder batches (and every other blast) were logged as a bare "N recipients"
-- row with no indication of whether Resend actually accepted them — a run that
-- failed outright (e.g. an unverified sender domain) logged nothing at all. Add:
--   * status       — 'sent' (all delivered), 'partial' (some failed), 'failed'
--                    (none delivered). Defaults to 'sent' so existing rows and the
--                    announce/invite routes (which log only their success path) are
--                    unaffected.
--   * failed_count — recipients Resend rejected, alongside recipient_count (sent).
--   * error        — first failure message, for diagnostics; null on full success.
--
-- No policy change: comms_log stays admin-read / admin-insert, and the reminder
-- cron keeps writing as the service role.
-- ============================================================================

alter table public.comms_log
  add column if not exists status text not null default 'sent'
    check (status in ('sent', 'partial', 'failed')),
  add column if not exists failed_count int not null default 0,
  add column if not exists error text;
