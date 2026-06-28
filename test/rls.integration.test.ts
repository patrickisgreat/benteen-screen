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

  it('event_invites are admin-only: a non-admin member reads zero rows', async () => {
    await admin!.from('event_invites').insert({ event_id: eventId, email: `rls_guest_${stamp}@example.com` })
    const mine = await memberClient.from('event_invites').select('*').eq('event_id', eventId)
    expect(mine.data ?? [], 'a non-admin member must not see the guest list').toHaveLength(0)
    const asAdmin = await admin!.from('event_invites').select('*').eq('event_id', eventId)
    expect((asAdmin.data ?? []).length, 'service role / admin sees the guest list').toBeGreaterThan(0)
    await admin!.from('event_invites').delete().eq('event_id', eventId)
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

  it('caps suggestions at 5 per user per event (server-side trigger)', async () => {
    for (let i = 0; i < 5; i++) {
      const { error } = await memberClient.from('suggestions').insert({ event_id: eventId, tmdb_movie: { id: i, title: `S${i}` } })
      expect(error, `suggestion ${i} should be allowed`).toBeNull()
    }
    const sixth = await memberClient.from('suggestions').insert({ event_id: eventId, tmdb_movie: { id: 99, title: 'over' } })
    expect(sixth.error, 'the 6th suggestion should be rejected by the cap').toBeTruthy()
    await admin!.from('suggestions').delete().eq('event_id', eventId)
  })

  it('caps votes at 3 per user per event (server-side trigger)', async () => {
    // Seed 4 suggestions via the service role (exempt from the suggestion cap) to vote on.
    const { data: seeded } = await admin!
      .from('suggestions')
      .insert([0, 1, 2, 3].map(i => ({ event_id: eventId, user_id: memberId, tmdb_movie: { id: 100 + i, title: `V${i}` } })))
      .select('id')
    const ids = (seeded ?? []).map(s => s.id)
    for (let i = 0; i < 3; i++) {
      const { error } = await memberClient.from('votes').insert({ suggestion_id: ids[i] })
      expect(error, `vote ${i} should be allowed`).toBeNull()
    }
    const fourth = await memberClient.from('votes').insert({ suggestion_id: ids[3] })
    expect(fourth.error, 'the 4th vote should be rejected by the cap').toBeTruthy()
    await admin!.from('votes').delete().eq('user_id', memberId)
    await admin!.from('suggestions').delete().eq('event_id', eventId)
  })

  it('voter privacy: a member sees only their own vote rows, but counts via the tally', async () => {
    // Two voters on the same suggestion, seeded via the service role.
    const otherEmail = `rls_other_${stamp}@example.com`
    const otherId = await makeUser(otherEmail)
    await admin!.from('invites').insert({ email: otherEmail })
    const { data: seeded } = await admin!
      .from('suggestions')
      .insert({ event_id: eventId, user_id: memberId, tmdb_movie: { id: 500, title: 'Privacy' } })
      .select('id')
      .single()
    const suggestionId = seeded!.id
    await admin!.from('votes').insert([
      { suggestion_id: suggestionId, user_id: memberId },
      { suggestion_id: suggestionId, user_id: otherId }
    ])

    // The member can read ONLY their own vote row — not the other voter's identity.
    const visible = await memberClient.from('votes').select('user_id').eq('suggestion_id', suggestionId)
    expect((visible.data ?? []).map(v => v.user_id), 'a member must not see other voters').toEqual([memberId])

    // …yet the SECURITY DEFINER tally still reports the true total (2), no identities.
    const tally = await memberClient.rpc('suggestion_vote_counts', { p_event_id: eventId })
    const row = (tally.data ?? []).find(r => r.suggestion_id === suggestionId)
    expect(Number(row?.votes), 'the tally exposes the count without the voters').toBe(2)

    // A signed-in but non-invited user gets nothing from the tally: the SECURITY
    // DEFINER function honors is_allowed() like every other gated path, so a guessed
    // event UUID is not a back door around the invite-only model.
    const outsiderTally = await outsiderClient.rpc('suggestion_vote_counts', { p_event_id: eventId })
    expect(outsiderTally.data ?? [], 'a non-allowed user must not get vote counts').toEqual([])

    // An admin still sees every voter (the admin drill-down needs the names).
    const asAdmin = await admin!.from('votes').select('user_id').eq('suggestion_id', suggestionId)
    expect((asAdmin.data ?? []).length, 'admin/service role sees all votes').toBe(2)

    await admin!.from('votes').delete().eq('suggestion_id', suggestionId)
    await admin!.from('suggestions').delete().eq('id', suggestionId)
    await admin!.from('invites').delete().eq('email', otherEmail)
  })

  it('blocks suggesting/voting until you RSVP “going”, then allows it', async () => {
    const gateEmail = `rls_gate_${stamp}@example.com`
    const gateId = await makeUser(gateEmail)
    await admin!.from('invites').insert({ email: gateEmail })
    const gateClient = await signInAs(gateEmail)

    // A suggestion seeded by the service role for the gate user to try to vote on.
    const { data: seed } = await admin!
      .from('suggestions')
      .insert({ event_id: eventId, user_id: memberId, tmdb_movie: { id: 700, title: 'Gatekept' } })
      .select('id')
      .single()
    const seedId = seed!.id

    // Not RSVP'd → both participation writes are rejected by RLS.
    const noSuggest = await gateClient.from('suggestions').insert({ event_id: eventId, tmdb_movie: { id: 701, title: 'Nope' } })
    expect(noSuggest.error, 'suggesting without a going RSVP should be rejected').toBeTruthy()
    const noVote = await gateClient.from('votes').insert({ suggestion_id: seedId })
    expect(noVote.error, 'voting without a going RSVP should be rejected').toBeTruthy()

    // A non-going RSVP ("maybe") is still not enough — going is the gate.
    await gateClient.from('rsvps').insert({ event_id: eventId, user_id: gateId, status: 'maybe' })
    const stillNoVote = await gateClient.from('votes').insert({ suggestion_id: seedId })
    expect(stillNoVote.error, '“maybe” must not unlock voting').toBeTruthy()

    // Flip to going → both writes now succeed.
    await gateClient.from('rsvps').update({ status: 'going' }).eq('event_id', eventId).eq('user_id', gateId)
    const okSuggest = await gateClient.from('suggestions').insert({ event_id: eventId, tmdb_movie: { id: 702, title: 'Yes' } })
    expect(okSuggest.error, 'suggesting while going should be allowed').toBeNull()
    const okVote = await gateClient.from('votes').insert({ suggestion_id: seedId })
    expect(okVote.error, 'voting while going should be allowed').toBeNull()

    await admin!.from('votes').delete().eq('user_id', gateId)
    await admin!.from('suggestions').delete().eq('event_id', eventId)
    await admin!.from('rsvps').delete().eq('user_id', gateId)
    await admin!.from('invites').delete().eq('email', gateEmail)
  })
})
