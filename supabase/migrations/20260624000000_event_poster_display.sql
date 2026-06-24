-- Per-event poster display settings for the overview header: header aspect ratio,
-- focal point, and zoom. Stored as jsonb (mirrors invite_options). Read/clamped
-- via shared/utils/posterDisplay.ts; null = the default (banner, centered, cover).
-- No new policy needed — covered by the existing admin-only update policy on events.
alter table public.events add column if not exists poster_display jsonb;
