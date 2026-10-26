-- ============================================================================
-- Restore the "Did my invite reach you?" starter template.
--
-- Templates are plain rows an admin can delete from the Comms tab, and this one
-- was deleted by accident. It is the short personal note for the audiences that
-- haven't replied (the "haven't opened" and "haven't replied" scopes), whose
-- copies close with their own one-click RSVP buttons — hence "tap a button
-- below". Body carries no greeting; the email adds "Hi <name>,".
--
-- Idempotent: a template an admin has re-created under the same name is left
-- alone.
-- ============================================================================

insert into public.comms_templates (name, subject, body) values (
  'Did my invite reach you?',
  'Did my movie night invite reach you?',
  '<p>I sent an invite for movie night a few days ago and I have a feeling it got buried in a Promotions tab, so I''m trying again.</p><p>We''d love to have you. Tap a button below to let me know if you can make it — it takes a second and you don''t need to sign in.</p><p>Hope to see you on the green!</p>'
) on conflict (name) do nothing;
