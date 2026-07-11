-- ============================================================================
-- Close the reminder gap for members who RSVP'd in the app.
--
-- 20260705000000_sync_member_rsvp_to_evite.sql mirrors rsvps → event_invites,
-- but only from the moment it was created and only when the rsvps row changes.
-- Two holes let already-RSVP'd members get "please RSVP" reminder emails:
--
--   1. No backfill: members who RSVP'd in-app before that trigger existed
--      still have rsvp = null on their e-vite row.
--   2. Invite created after the RSVP: the trigger watches rsvps, so an e-vite
--      row added for a member who already responded starts null and never syncs.
--
-- Fix: a BEFORE INSERT trigger on event_invites that adopts the member's
-- current in-app RSVP (matched by event + normalized email, same rule as the
-- other direction), plus a one-time backfill for the rows already in the gap.
-- Explicitly-set rsvp values (e.g. imports) are never clobbered. Email edits
-- on an existing invite are not re-synced — invites are created, not re-keyed.
-- ============================================================================

create function public.sync_evite_from_member_rsvp() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  member_status text;
  member_since  timestamptz;
begin
  if new.rsvp is not null then
    return new;
  end if;
  select r.status, r.updated_at into member_status, member_since
  from public.rsvps r
  join public.profiles p on p.id = r.user_id
  where r.event_id = new.event_id
    and lower(trim(p.email)) = lower(trim(new.email))
  limit 1;
  if member_status is not null then
    new.rsvp := member_status;
    new.rsvp_at := coalesce(member_since, now());
  end if;
  return new;
end;
$$;

create trigger event_invites_sync_from_member_rsvp
  before insert on public.event_invites
  for each row execute function public.sync_evite_from_member_rsvp();

-- One-time backfill for invites already out of sync (pre-trigger RSVPs and
-- invites created after the member responded).
update public.event_invites ei
set rsvp    = r.status,
    rsvp_at = coalesce(r.updated_at, now())
from public.rsvps r
join public.profiles p on p.id = r.user_id
where ei.rsvp is null
  and ei.event_id = r.event_id
  and lower(trim(ei.email)) = lower(trim(p.email));
