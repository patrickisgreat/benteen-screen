import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// ---------------------------------------------------------------------------
// Integration coverage for the invite-only RLS boundary (Invariant 1) — the
// test the unit suite *can't* be, because it exercises the actual Postgres
// policies, not the UX layer.
//
// Run against a local Supabase with these migrations applied:
//   supabase start                         # Docker
//   SUPABASE_TEST_URL=http://127.0.0.1:54321 \
//   SUPABASE_TEST_ANON_KEY=<anon key> \
//   SUPABASE_TEST_SERVICE_KEY=<service_role key> \
//   npx vitest run test/rls.integration.test.ts
//
// Skipped when those env vars are absent so the default unit run is unaffected.
// ---------------------------------------------------------------------------

const url = process.env.SUPABASE_TEST_URL
const anonKey = process.env.SUPABASE_TEST_ANON_KEY
const serviceKey = process.env.SUPABASE_TEST_SERVICE_KEY
const ready = Boolean(url && anonKey && serviceKey)

const admin = ready
  ? createClient(url as string, serviceKey as string, { auth: { persistSession: false, autoRefreshToken: false } })
  : null

const PASSWORD = 'rls-test-Password-1!'
const createdUserIds: string[] = []
const GATED_TABLES = ['events', 'suggestions', 'votes', 'rsvps', 'bring_items'] as const

async function makeUser(email: string): Promise<string> {
  const { data, error } = await admin!.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true })
  if (error || !data.user) throw error ?? new Error('createUser failed')
  createdUserIds.push(data.user.id)
  return data.user.id
}

async function signInAs(email: string): Promise<SupabaseClient> {
  const client = createClient(url as string, anonKey as string, { auth: { persistSession: false, autoRefreshToken: false } })
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD })
  if (error) throw error
  return client
}

describe.skipIf(!ready)('invite-only RLS boundary', () => {
  const stamp = Date.now()
  const adminEmail = `rls_admin_${stamp}@example.com`
  const memberEmail = `rls_member_${stamp}@example.com`
  const outsiderEmail = `rls_outsider_${stamp}@example.com`

  let memberId = ''
  let memberClient: SupabaseClient
  let outsiderClient: SupabaseClient
  let eventId = ''

  beforeAll(async () => {
    const adminId = await makeUser(adminEmail)
    memberId = await makeUser(memberEmail)
    await makeUser(outsiderEmail)

    // Allowlist admin + member; the outsider is intentionally left off.
    await admin!.from('invites').insert([{ email: adminEmail }, { email: memberEmail }])
    await admin!.from('profiles').update({ is_admin: true }).eq('id', adminId)

    const { data: ev, error } = await admin!
      .from('events')
      .insert({ title: 'RLS Night', event_date: new Date(stamp + 7 * 86_400_000).toISOString() })
      .select('id')
      .single()
    if (error || !ev) throw error ?? new Error('event seed failed')
    eventId = ev.id

    memberClient = await signInAs(memberEmail)
    outsiderClient = await signInAs(outsiderEmail)
  }, 30_000)

  afterAll(async () => {
    if (!admin) return
    await admin.from('events').delete().eq('id', eventId)
    await admin.from('invites').delete().in('email', [adminEmail, memberEmail])
    await admin.from('app_settings').update({ max_invites: null }).eq('id', true)
    for (const id of createdUserIds) await admin.auth.admin.deleteUser(id)
  })

  it('an allowlisted member can read events', async () => {
    const { data } = await memberClient.from('events').select('id').eq('id', eventId)
    expect(data ?? []).toHaveLength(1)
  })

  it('an allowlisted member can RSVP (allowed + not blocked)', async () => {
    const { error } = await memberClient.from('rsvps').insert({ event_id: eventId, user_id: memberId, status: 'going' })
    expect(error).toBeNull()
  })

  it('a non-allowlisted user reads zero rows from every gated table', async () => {
    for (const table of GATED_TABLES) {
      const { data } = await outsiderClient.from(table).select('*')
      expect(data ?? [], `expected no ${table} rows`).toHaveLength(0)
    }
  })

  it('a non-allowlisted user cannot insert a suggestion', async () => {
    const { error } = await outsiderClient.from('suggestions').insert({ event_id: eventId, tmdb_movie: { id: 1, title: 'X' } })
    expect(error).toBeTruthy()
  })

  it('the total invite cap blocks an over-limit member invite but exempts admin/seed', async () => {
    const { count } = await admin!.from('invites').select('*', { count: 'exact', head: true })
    // Set the cap to the current size so the next member-issued invite is over-limit.
    await admin!.from('app_settings').update({ max_invites: count ?? 0 }).eq('id', true)

    const overLimit = await memberClient.from('invites').insert({ email: `rls_over_${stamp}@example.com`, invited_by: memberId })
    expect(overLimit.error, 'member invite past the cap should be rejected').toBeTruthy()

    // Service-role / seed-style insert (invited_by null) is exempt from the cap.
    const byAdmin = await admin!.from('invites').insert({ email: `rls_byadmin_${stamp}@example.com` })
    expect(byAdmin.error, 'admin/seed insert should be exempt').toBeNull()

    await admin!.from('invites').delete().eq('email', `rls_byadmin_${stamp}@example.com`)
    await admin!.from('app_settings').update({ max_invites: null }).eq('id', true)
  })
})
