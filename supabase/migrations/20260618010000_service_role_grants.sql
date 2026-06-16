-- ============================================================================
-- service_role table grants. service_role is the server-only key (Invariant 2)
-- and operates below RLS for admin/server routes (e.g. the event-blast recipient
-- lookup, account deletion). Hosted Supabase grants it DML on the public schema
-- by default; grant it explicitly so behavior is deterministic across hosted and
-- local (supabase start) environments. service_role never reaches the browser.
-- ============================================================================

grant select, insert, update, delete on all tables in schema public to service_role;
alter default privileges in schema public
  grant select, insert, update, delete on tables to service_role;
