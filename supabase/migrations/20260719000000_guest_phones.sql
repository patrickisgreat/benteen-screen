-- ============================================================================
-- Texting guests from the host's own phone.
--
-- When the e-vite emails don't bring in enough RSVPs, the host wants to nudge
-- people personally — a real text from their own number, not a blast from a
-- short code. The app never sends SMS itself: it builds an `sms:` link with the
-- guest's number and a personalized message, and the host's Messages app does
-- the rest. All the app needs to remember is a number per guest and who has
-- already been texted.
--
--   event_invites.phone     — the guest's mobile number, normalized to E.164 by
--       the app (`normalizePhone`) and shape-checked here so a stray "555-1234"
--       can't slip in and produce a dead `sms:` link.
--   event_invites.texted_at — when the host last opened a text to this guest, so
--       the list can show "Texted" and the host doesn't nag the same person twice.
--
-- Both ride the existing admin-only policy on event_invites ("event_invites:
-- admin all"); non-admins can't read a number or stamp a text (Invariant 1).
-- Numbers carry forward with "pull from last event" and the guest directory, so
-- a number is typed once per person, not once per event.
-- ============================================================================

alter table public.event_invites
  add column if not exists phone text
    check (phone is null or phone ~ '^\+[1-9][0-9]{6,14}$'),
  add column if not exists texted_at timestamptz;
