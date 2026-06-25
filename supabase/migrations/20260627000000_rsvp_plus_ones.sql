-- "+1" / guest count — let an attendee say how many additional guests they're
-- bringing when they RSVP "going". Stored on BOTH RSVP stores so the merged
-- headcount (useEventRsvps) is accurate whether someone replied in-app or by e-vite:
--   public.rsvps.plus_ones         — in-app member RSVPs
--   public.event_invites.plus_ones — tokenized e-vite replies
--
-- Additive and safe (default 0 = today's behavior). The CHECK is the server-side
-- source of truth, capped so a typo can't inflate the count; the UI mirrors the cap
-- via MAX_PLUS_ONES in shared/types/rsvp.ts (keep the two in sync).

alter table public.rsvps
  add column if not exists plus_ones int not null default 0
  constraint rsvps_plus_ones_range check (plus_ones >= 0 and plus_ones <= 10);

alter table public.event_invites
  add column if not exists plus_ones int not null default 0
  constraint event_invites_plus_ones_range check (plus_ones >= 0 and plus_ones <= 10);
