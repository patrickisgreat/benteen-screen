-- Make the per-event participation caps admin-configurable via app_settings,
-- defaulting to the original 5 suggestions / 3 votes when unset. The enforce_*
-- triggers already call suggestion_limit()/vote_limit(), so redefining those to
-- read app_settings makes the caps tunable with no trigger changes. The functions
-- become `stable` (they read a table) instead of `immutable`.
alter table public.app_settings add column if not exists max_suggestions int check (max_suggestions is null or max_suggestions >= 1);
alter table public.app_settings add column if not exists max_votes int check (max_votes is null or max_votes >= 1);

create or replace function public.suggestion_limit() returns int
  language sql stable set search_path = public as $$
  select coalesce((select max_suggestions from public.app_settings where id), 5)
$$;

create or replace function public.vote_limit() returns int
  language sql stable set search_path = public as $$
  select coalesce((select max_votes from public.app_settings where id), 3)
$$;
