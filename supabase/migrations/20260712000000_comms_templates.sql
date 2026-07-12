-- Reusable announcement templates for the admin Comms tab, so a recurring blast
-- (e.g. the "log in and vote + check the bring list" nudge) is composed once and
-- sent again later with one click.
--
-- `body` is rich HTML from the composer's editor. It is NOT rendered raw anywhere:
-- the editor loads it as content, and the announce route re-sanitizes at send time
-- (sanitizeEmailHtml), so a hand-crafted row can't inject markup into emails.

create table public.comms_templates (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  subject    text,
  body       text not null,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.comms_templates enable row level security;
grant select, insert, delete on public.comms_templates to authenticated;

-- Admin-only in both directions: templates are an admin tool and can reveal
-- upcoming comms before they're sent.
create policy "comms_templates: admin read" on public.comms_templates
  for select to authenticated using (public.is_admin());
create policy "comms_templates: admin insert" on public.comms_templates
  for insert to authenticated with check (public.is_admin());
create policy "comms_templates: admin delete" on public.comms_templates
  for delete to authenticated using (public.is_admin());

-- Starter template: the recurring vote + bring-list reminder. The announce email
-- wrapper already adds the event title/date and a "View on Benteen Screen" button,
-- so the body stays event-agnostic.
insert into public.comms_templates (name, subject, body) values (
  'Vote & bring list reminder',
  'Reminder: vote for the movie & check the bring list',
  '<p>Hey folks! 🎬</p><p>Movie night is coming up — two quick things:</p><ul><li><strong>Vote for the movie</strong> — log in and cast your votes for what we watch.</li><li><strong>Check the bring list</strong> — claim an item or add what you''re bringing.</li></ul><p>See you on the green!</p>'
);
