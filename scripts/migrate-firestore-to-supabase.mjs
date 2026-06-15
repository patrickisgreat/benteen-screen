#!/usr/bin/env node
/**
 * One-time Firestore → Supabase data migration.
 *
 * Brings users, events, suggestions, and votes from the old Firebase project
 * into the new Supabase schema (supabase/migrations/*.sql must be applied first).
 *
 * Prerequisites:
 *   npm install --no-save firebase-admin            # not an app dependency
 *   export GOOGLE_APPLICATION_CREDENTIALS=/abs/path/to/firebase-service-account.json
 *   export SUPABASE_URL=https://<project-ref>.supabase.co
 *   export SUPABASE_SERVICE_KEY=<service-role / secret key>   # NOT the anon key
 *
 * Run:
 *   node scripts/migrate-firestore-to-supabase.mjs
 *
 * Notes:
 *   - Creates a Supabase auth user per Firestore user (by email, email-confirmed).
 *     For a returning user's Google sign-in to map onto their migrated account,
 *     Supabase must link identities by confirmed email (Auth → Providers / settings).
 *   - The per-event limit triggers skip service-role inserts (auth.uid() is null),
 *     so historical data that exceeds the new limits still imports.
 *   - Safe to re-run: existing auth users are reused. Events are inserted fresh
 *     each run, so run it once (or truncate public.events first to redo).
 */
import admin from 'firebase-admin'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.NUXT_SUPABASE_SECRET_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_KEY (service-role key) in the environment.')
  process.exit(1)
}

admin.initializeApp() // reads GOOGLE_APPLICATION_CREDENTIALS
const firestore = admin.firestore()
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } })

const toIso = ts => (ts && typeof ts.toDate === 'function' ? ts.toDate().toISOString() : new Date().toISOString())

// --- preload existing Supabase auth users (email -> id) ----------------------
const usersByEmail = new Map()
for (let page = 1; ; page++) {
  const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 })
  if (error) throw error
  for (const u of data.users) if (u.email) usersByEmail.set(u.email.toLowerCase(), u.id)
  if (data.users.length < 1000) break
}

async function ensureUser(email, displayName, avatarUrl) {
  const key = email.toLowerCase()
  if (usersByEmail.has(key)) return usersByEmail.get(key)
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { full_name: displayName ?? null, avatar_url: avatarUrl ?? null }
  })
  if (error) throw error
  usersByEmail.set(key, data.user.id)
  return data.user.id
}

// --- 1. users -> auth users + profiles ---------------------------------------
const uidToId = new Map() // firestore uid -> supabase id
const usersSnap = await firestore.collection('users').get()
for (const doc of usersSnap.docs) {
  const u = doc.data()
  if (!u.email) {
    console.warn(`skip user ${doc.id}: no email`)
    continue
  }
  const id = await ensureUser(u.email, u.displayName, u.photoURL)
  uidToId.set(doc.id, id)
  await supabase.from('profiles').update({
    email: u.email,
    display_name: u.displayName ?? null,
    avatar_url: u.photoURL ?? null
  }).eq('id', id)
  console.log(`user ${u.email} -> ${id}`)
}

// --- 2. roles -> profiles.is_admin -------------------------------------------
const rolesSnap = await firestore.collection('roles').get()
for (const doc of rolesSnap.docs) {
  if (doc.data().role === 'admin' && uidToId.has(doc.id)) {
    await supabase.from('profiles').update({ is_admin: true }).eq('id', uidToId.get(doc.id))
    console.log(`admin: ${doc.id}`)
  }
}

// --- 3-5. events, suggestions, votes -----------------------------------------
const eventsSnap = await firestore.collection('events').get()
for (const eventDoc of eventsSnap.docs) {
  const e = eventDoc.data()
  const { data: ev, error: evErr } = await supabase.from('events')
    .insert({ title: e.title ?? 'Untitled', description: e.description ?? '', event_date: toIso(e.timestamp) })
    .select('id').single()
  if (evErr) {
    console.error(`event "${e.title}" failed:`, evErr.message)
    continue
  }
  console.log(`event "${e.title}" -> ${ev.id}`)

  const sugSnap = await firestore.collection(`events/${eventDoc.id}/suggestions`).get()
  for (const sugDoc of sugSnap.docs) {
    const s = sugDoc.data()
    const userId = (s.userReference?.id && uidToId.get(s.userReference.id))
      || (s.userEmail && usersByEmail.get(String(s.userEmail).toLowerCase()))
    if (!userId) {
      console.warn(`skip suggestion ${sugDoc.id}: no mapped user`)
      continue
    }
    const { data: sug, error: sErr } = await supabase.from('suggestions')
      .insert({ event_id: ev.id, user_id: userId, tmdb_movie: s.suggestedItem, deleted: Boolean(s.deleted), created_at: toIso(s.createdAt) })
      .select('id').single()
    if (sErr) {
      console.error(`suggestion ${sugDoc.id} failed:`, sErr.message)
      continue
    }

    for (const v of Array.isArray(s.votes) ? s.votes : []) {
      const voterId = (v.userId && uidToId.get(v.userId)) || (v.userReference?.id && uidToId.get(v.userReference.id))
      if (!voterId) continue
      const { error: vErr } = await supabase.from('votes').insert({ suggestion_id: sug.id, user_id: voterId })
      if (vErr && !vErr.message.includes('duplicate')) console.warn(`vote failed:`, vErr.message)
    }
  }
}

console.log('Migration complete.')
process.exit(0)
