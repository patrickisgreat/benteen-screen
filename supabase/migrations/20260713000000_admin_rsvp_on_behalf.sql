-- ============================================================================
-- Admins can RSVP on a member's behalf (and set their +1s).
--
-- Until now `rsvps` was strictly self-service: insert/update/delete only where
-- user_id = auth.uid(). The admin guest-list manager needs to record a reply for
-- someone who told the host in person ("we're coming, plus two") without that
-- person ever opening the app or the e-vite. Email-only guests were already
-- coverable through `event_invites` (admin-all policy); this closes the gap for
-- members, whose authoritative reply lives in `rsvps` (see useEventRsvps).
--
-- Invariant 1: the admin route runs under the admin's own session, so these
-- policies — not the route — are the boundary. Non-admins keep the self-only
-- policies untouched; a member still cannot touch anyone else's row.
--
-- The existing AFTER triggers on rsvps keep everything consistent on an admin
-- write exactly as on a self write: rsvps_sync_visibility hides/restores the
-- member's picks + votes, and rsvps_sync_to_evite mirrors the status into their
-- e-vite row so reminders stop nagging them.
-- ============================================================================

create policy "rsvps: admin insert" on public.rsvps
  for insert to authenticated
  with check (public.is_admin());

create policy "rsvps: admin update" on public.rsvps
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "rsvps: admin delete" on public.rsvps
  for delete to authenticated
  using (public.is_admin());
