-- ============================================================================
-- Personal blurb on a suggestion: a short note from the suggester about why the
-- group should screen it / why they love it. Optional and editable by the author.
-- Existing suggestions get it for free (nullable column).
--
-- The blurb is plain text, rendered escaped (never v-html), so it's not the stored-
-- HTML XSS vector of Invariant 5. Length is capped in the DB (and mirrored in the
-- UI). Editing goes through an author-only SECURITY DEFINER RPC because there's no
-- author-update RLS policy on suggestions (only admins update, for moderation) —
-- this keeps authors to ONLY their own blurb, never `deleted` / `culled_at` / etc.
-- ============================================================================

alter table public.suggestions
  add column if not exists blurb text
  constraint suggestions_blurb_len check (blurb is null or char_length(blurb) <= 500);

create function public.set_suggestion_blurb(p_suggestion_id uuid, p_blurb text)
  returns void language plpgsql security definer set search_path = public as $$
declare
  trimmed text := nullif(btrim(p_blurb), '');
begin
  if not public.is_allowed() or public.is_blocked() then
    raise exception 'not allowed' using errcode = 'insufficient_privilege';
  end if;
  if char_length(coalesce(trimmed, '')) > 500 then
    raise exception 'blurb too long (max 500)' using errcode = 'check_violation';
  end if;
  update public.suggestions
    set blurb = trimmed
    where id = p_suggestion_id and user_id = auth.uid();
  if not found then
    raise exception 'not your suggestion' using errcode = 'insufficient_privilege';
  end if;
end;
$$;
revoke all on function public.set_suggestion_blurb(uuid, text) from public;
grant execute on function public.set_suggestion_blurb(uuid, text) to authenticated;
