-- ============================================================================
-- Starter comms templates, rewritten for per-recipient email.
--
-- Announcements now open with the recipient's own first name ("Hi Sam,"), so the
-- original starter's group greeting ("Hey folks!") reads wrong right under it.
-- This puts the standard vote + bring-list reminder back if it was deleted,
-- refreshes its body where it is still the untouched original, and adds a short
-- personal note for the "haven't opened the e-vite" audience. Bodies carry no
-- greeting of their own — the email adds it.
--
-- Idempotent: a template an admin has edited or re-created under the same name
-- is left alone.
-- ============================================================================

insert into public.comms_templates (name, subject, body) values (
  'Vote & bring list reminder',
  'Reminder: vote for the movie & check the bring list',
  '<p>Movie night is coming up 🎬 Two quick things:</p><ul><li><strong>Vote for the movie</strong> — log in and cast your votes for what we watch.</li><li><strong>Check the bring list</strong> — claim an item or add what you''re bringing.</li></ul><p>See you on the green!</p>'
) on conflict (name) do nothing;

update public.comms_templates
set body = '<p>Movie night is coming up 🎬 Two quick things:</p><ul><li><strong>Vote for the movie</strong> — log in and cast your votes for what we watch.</li><li><strong>Check the bring list</strong> — claim an item or add what you''re bringing.</li></ul><p>See you on the green!</p>'
where name = 'Vote & bring list reminder'
  and body = '<p>Hey folks! 🎬</p><p>Movie night is coming up — two quick things:</p><ul><li><strong>Vote for the movie</strong> — log in and cast your votes for what we watch.</li><li><strong>Check the bring list</strong> — claim an item or add what you''re bringing.</li></ul><p>See you on the green!</p>';

insert into public.comms_templates (name, subject, body) values (
  'Did my invite reach you?',
  'Did my movie night invite reach you?',
  '<p>I sent an invite for movie night a few days ago and I have a feeling it got buried in a Promotions tab, so I''m trying again.</p><p>We''d love to have you. Tap a button below to let me know if you can make it — it takes a second and you don''t need to sign in.</p><p>Hope to see you on the green!</p>'
) on conflict (name) do nothing;
