-- ============================================================================
-- Mirror a member's in-app RSVP into their e-vite row. The one-click RSVP route
-- already syncs the other direction (event_invites → rsvps); this closes the loop
-- so the e-vite roster reflects in-app responses and the reminder system never
-- nags a member who already replied in the app.
--
-- Members have no write access to event_invites (admin-only RLS), so this is a
-- SECURITY DEFINER trigger. It matches the e-vite row by (event, email). A DELETE
-- (un-RSVP) clears the response back to "no reply" so they're remindable again.
-- ============================================================================

create function public.sync_member_rsvp_to_evite() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  uid          uuid;
  eid          uuid;
  new_status   text;
  member_email text;
begin
  if tg_op = 'DELETE' then
    uid := old.user_id; eid := old.event_id; new_status := null;
  else
    uid := new.user_id; eid := new.event_id; new_status := new.status;
  end if;

  select lower(trim(email)) into member_email from public.profiles where id = uid;
  if member_email is null or member_email = '' then
    return coalesce(new, old);
  end if;

  update public.event_invites
    set rsvp = new_status,
        rsvp_at = case when new_status is null then null else now() end
    where event_id = eid and lower(trim(email)) = member_email;

  return coalesce(new, old);
end;
$$;

create trigger rsvps_sync_to_evite
  after insert or update or delete on public.rsvps
  for each row execute function public.sync_member_rsvp_to_evite();
