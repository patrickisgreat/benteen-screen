-- ============================================================================
-- Admins can edit a person's details: display name and mobile number.
--
-- Two stores, because the two facts have different privacy:
--
--   * Names are public to the club already (profiles / invites), so an admin
--     fixing one just needs a write path. Members: a column-safe RPC
--     (`admin_set_display_name`) in the style of admin_set_blocked — it can only
--     ever touch display_name, never is_admin/blocked (Invariant 4). Roster
--     entries: the existing "invites: admin update" policy already allows it.
--
--   * Phone numbers are admin-only (see 20260719000000_guest_phones.sql) and
--     must never land on a member-readable table. Until now a number lived only
--     on per-event guest rows, so a person who wasn't on any list had nowhere to
--     keep one. `contacts` is the person-level, admin-only home for it, keyed by
--     normalized email like the roster. A trigger remembers any number typed on
--     a guest list, so the host types a number once and it follows the person.
-- ============================================================================

create table public.contacts (
  email      text primary key,
  phone      text check (phone is null or phone ~ '^\+[1-9][0-9]{6,14}$'),
  updated_at timestamptz not null default now()
);

-- Same key normalization as invites / event_invites, so lookups by email match.
create trigger contacts_normalize_email before insert or update on public.contacts
  for each row execute function public.normalize_invite_email();

alter table public.contacts enable row level security;
grant select, insert, update, delete on public.contacts to authenticated;
grant select, insert, update, delete on public.contacts to service_role;

-- Admin-only, like event_invites: a member must not be able to read anyone's number.
create policy "contacts: admin all" on public.contacts
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- A number saved on any guest list becomes the person's number. SECURITY DEFINER
-- because the writer is an admin anyway and the trigger must not depend on the
-- caller's policies; it only ever copies new.phone onto new.email's contact.
create function public.remember_guest_phone() returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  if new.phone is not null and (tg_op = 'INSERT' or new.phone is distinct from old.phone) then
    insert into public.contacts (email, phone) values (new.email, new.phone)
    on conflict (email) do update set phone = excluded.phone, updated_at = now();
  end if;
  return new;
end;
$$;

create trigger event_invites_remember_phone
  after insert or update of phone on public.event_invites
  for each row execute function public.remember_guest_phone();

-- Backfill: the most recently typed number per person from existing guest lists.
insert into public.contacts (email, phone)
select distinct on (lower(trim(email))) lower(trim(email)), phone
from public.event_invites
where phone is not null
order by lower(trim(email)), created_at desc
on conflict (email) do nothing;

-- Admin-only, column-safe rename: only ever changes display_name.
create function public.admin_set_display_name(target_id uuid, value text)
  returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'only admins may rename members';
  end if;
  if value is null or btrim(value) = '' then
    raise exception 'a display name is required';
  end if;
  update public.profiles set display_name = btrim(value) where id = target_id;
end;
$$;
revoke all on function public.admin_set_display_name(uuid, text) from public;
grant execute on function public.admin_set_display_name(uuid, text) to authenticated;
