-- ============================================================================
-- Per-event e-vite customization (Evite-style editor): theme, accent color, a
-- custom message, and include toggles, stored as jsonb on the event. Admin-only
-- writes are already enforced by the existing "events: admin update" policy.
-- ============================================================================

alter table public.events add column if not exists invite_options jsonb;
