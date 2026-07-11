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
  let adminUserId = ''
  let memberClient: SupabaseClient
  let outsiderClient: SupabaseClient
  let eventId = ''

  beforeAll(async () => {
    const adminId = await makeUser(adminEmail)
    adminUserId = adminId
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

    // A non-going RSVP is still not enough — going is the gate. Check both
    // "maybe" and "no" explicitly so the going-only intent is airtight.
    await gateClient.from('rsvps').insert({ event_id: eventId, user_id: gateId, status: 'maybe' })
    const noVoteMaybe = await gateClient.from('votes').insert({ suggestion_id: seedId })
    expect(noVoteMaybe.error, '“maybe” must not unlock voting').toBeTruthy()

    await gateClient.from('rsvps').update({ status: 'no' }).eq('event_id', eventId).eq('user_id', gateId)
    const noVoteNo = await gateClient.from('votes').insert({ suggestion_id: seedId })
    expect(noVoteNo.error, '“no” must not unlock voting').toBeTruthy()

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

  it('un-RSVP hides the user’s suggestions + votes; re-RSVP restores them', async () => {
    const email = `rls_hide_${stamp}@example.com`
    const uid = await makeUser(email)
    await admin!.from('invites').insert({ email })
    const client = await signInAs(email)

    // Another member's suggestion (service role) for our user to vote on, plus our
    // own suggestion B. Both happen while "going" (the participation gate).
    const { data: a } = await admin!
      .from('suggestions')
      .insert({ event_id: eventId, user_id: memberId, tmdb_movie: { id: 800, title: 'Voted' } })
      .select('id').single()
    const aId = a!.id

    await client.from('rsvps').insert({ event_id: eventId, user_id: uid, status: 'going' })
    const { data: b } = await client
      .from('suggestions').insert({ event_id: eventId, tmdb_movie: { id: 801, title: 'Mine' } })
      .select('id').single()
    const bId = b!.id
    await client.from('votes').insert({ suggestion_id: aId })

    // Baseline (going): B visible, vote live, tally counts A.
    const beforeB = await admin!.from('suggestions').select('rsvp_hidden_at').eq('id', bId).single()
    expect(beforeB.data!.rsvp_hidden_at, 'B starts visible').toBeNull()
    const beforeVote = await admin!.from('votes').select('hidden_at').eq('suggestion_id', aId).eq('user_id', uid).single()
    expect(beforeVote.data!.hidden_at, 'the vote starts live').toBeNull()
    const tallyBefore = await client.rpc('suggestion_vote_counts', { p_event_id: eventId })
    expect(Number((tallyBefore.data ?? []).find(r => r.suggestion_id === aId)?.votes), 'A counts the vote').toBe(1)

    // Leave "going" → suggestions hidden, votes soft-deleted.
    await client.from('rsvps').update({ status: 'maybe' }).eq('event_id', eventId).eq('user_id', uid)
    const hiddenB = await admin!.from('suggestions').select('rsvp_hidden_at').eq('id', bId).single()
    expect(hiddenB.data!.rsvp_hidden_at, 'B is rsvp-hidden after leaving going').not.toBeNull()
    const hiddenVote = await admin!.from('votes').select('hidden_at').eq('suggestion_id', aId).eq('user_id', uid).single()
    expect(hiddenVote.data!.hidden_at, 'the vote is soft-deleted after leaving going').not.toBeNull()
    const tallyHidden = await client.rpc('suggestion_vote_counts', { p_event_id: eventId })
    expect((tallyHidden.data ?? []).find(r => r.suggestion_id === aId), 'the hidden vote no longer counts').toBeUndefined()

    // Return to "going" → restored to the exact prior state.
    await client.from('rsvps').update({ status: 'going' }).eq('event_id', eventId).eq('user_id', uid)
    const restoredB = await admin!.from('suggestions').select('rsvp_hidden_at').eq('id', bId).single()
    expect(restoredB.data!.rsvp_hidden_at, 'B is restored on re-RSVP').toBeNull()
    const restoredVote = await admin!.from('votes').select('hidden_at').eq('suggestion_id', aId).eq('user_id', uid).single()
    expect(restoredVote.data!.hidden_at, 'the vote is restored on re-RSVP').toBeNull()
    const tallyRestored = await client.rpc('suggestion_vote_counts', { p_event_id: eventId })
    expect(Number((tallyRestored.data ?? []).find(r => r.suggestion_id === aId)?.votes), 'the vote counts again').toBe(1)

    await admin!.from('votes').delete().eq('user_id', uid)
    await admin!.from('suggestions').delete().in('id', [aId, bId])
    await admin!.from('rsvps').delete().eq('user_id', uid)
    await admin!.from('invites').delete().eq('email', email)
  })

  it('cull RPCs cut the right titles (zero-vote + keep-top-N) and are admin-only', async () => {
    const adminClient = await signInAs(adminEmail)
    const mk = async (movieId: number, title: string): Promise<string> => {
      const { data } = await admin!
        .from('suggestions').insert({ event_id: eventId, user_id: memberId, tmdb_movie: { id: movieId, title } })
        .select('id').single()
      return data!.id
    }
    const top = await mk(900, 'Top')
    const mid = await mk(901, 'Mid')
    const zero = await mk(902, 'Zero')
    // Seed votes via the service role (exempt from the gate/cap): top=2, mid=1, zero=0.
    await admin!.from('votes').insert([
      { suggestion_id: top, user_id: memberId },
      { suggestion_id: top, user_id: adminUserId },
      { suggestion_id: mid, user_id: memberId }
    ])

    // A non-admin cannot prune.
    const denied = await memberClient.rpc('cull_zero_votes', { p_event_id: eventId })
    expect(denied.error, 'a non-admin must not be able to prune').toBeTruthy()

    // Zero-vote tail-cull removes 'zero' only.
    const z = await adminClient.rpc('cull_zero_votes', { p_event_id: eventId })
    expect(z.error).toBeNull()
    expect(z.data, 'one zero-vote title cut').toBe(1)
    const zeroRow = await admin!.from('suggestions').select('culled_at').eq('id', zero).single()
    expect(zeroRow.data!.culled_at, 'zero is culled').not.toBeNull()

    // Keep-top-1 runoff cuts 'mid', keeps 'top'.
    const r = await adminClient.rpc('cull_to_top', { p_event_id: eventId, p_keep: 1 })
    expect(r.error).toBeNull()
    expect(r.data, 'one runner-up cut').toBe(1)
    const midRow = await admin!.from('suggestions').select('culled_at').eq('id', mid).single()
    expect(midRow.data!.culled_at, 'mid is culled').not.toBeNull()
    const topRow = await admin!.from('suggestions').select('culled_at').eq('id', top).single()
    expect(topRow.data!.culled_at, 'top survives').toBeNull()

    // The tally now reports only the survivor.
    const tally = await memberClient.rpc('suggestion_vote_counts', { p_event_id: eventId })
    expect((tally.data ?? []).map(t => t.suggestion_id), 'only the survivor is counted').toEqual([top])

    await admin!.from('votes').delete().in('suggestion_id', [top, mid, zero])
    await admin!.from('suggestions').delete().in('id', [top, mid, zero])
  })

  it('refunds a culled title’s vote back to the voter’s budget', async () => {
    await memberClient.from('rsvps').upsert({ event_id: eventId, user_id: memberId, status: 'going' }, { onConflict: 'event_id,user_id' })
    const mk = async (movieId: number, title: string): Promise<string> => {
      const { data } = await admin!
        .from('suggestions').insert({ event_id: eventId, user_id: memberId, tmdb_movie: { id: movieId, title } })
        .select('id').single()
      return data!.id
    }
    const ids = [await mk(910, 'A'), await mk(911, 'B'), await mk(912, 'C'), await mk(913, 'D')]

    // Member spends the full 3-vote budget on A, B, C.
    for (const id of ids.slice(0, 3)) {
      const { error } = await memberClient.from('votes').insert({ suggestion_id: id })
      expect(error, 'votes within the cap are allowed').toBeNull()
    }
    // At the cap, a 4th vote (D) is rejected.
    const capped = await memberClient.from('votes').insert({ suggestion_id: ids[3] })
    expect(capped.error, 'the 4th vote is over the cap').toBeTruthy()

    // Cull C → the member's vote on it no longer counts toward their budget.
    await admin!.from('suggestions').update({ culled_at: new Date().toISOString() }).eq('id', ids[2])

    // The refunded slot lets the member vote on the surviving D.
    const refunded = await memberClient.from('votes').insert({ suggestion_id: ids[3] })
    expect(refunded.error, 'the freed slot lets the member vote again').toBeNull()

    await admin!.from('votes').delete().eq('user_id', memberId).in('suggestion_id', ids)
    await admin!.from('suggestions').delete().in('id', ids)
  })

  it('locks in a top-3 voted suggestion within a week so an un-RSVP can’t hide it', async () => {
    // Event 3 days out — inside the lock-in window.
    const { data: ev } = await admin!
      .from('events').insert({ title: 'Soon', event_date: new Date(stamp + 3 * 86_400_000).toISOString() })
      .select('id').single()
    const soonId = ev!.id

    const email = `rls_lockin_${stamp}@example.com`
    const uid = await makeUser(email)
    await admin!.from('invites').insert({ email })
    const client = await signInAs(email)
    await client.from('rsvps').insert({ event_id: soonId, user_id: uid, status: 'going' })
    const { data: a } = await client.from('suggestions').insert({ event_id: soonId, tmdb_movie: { id: 950, title: 'Contender' } }).select('id').single()
    const { data: b } = await client.from('suggestions').insert({ event_id: soonId, tmdb_movie: { id: 951, title: 'Longshot' } }).select('id').single()
    // Contender has a vote (top-3, >0); Longshot has none.
    await admin!.from('votes').insert({ suggestion_id: a!.id, user_id: memberId })

    // Author bails.
    await client.from('rsvps').update({ status: 'no' }).eq('event_id', soonId).eq('user_id', uid)

    const aRow = await admin!.from('suggestions').select('rsvp_hidden_at').eq('id', a!.id).single()
    const bRow = await admin!.from('suggestions').select('rsvp_hidden_at').eq('id', b!.id).single()
    expect(aRow.data!.rsvp_hidden_at, 'a top-3 voted title within a week stays on the ballot').toBeNull()
    expect(bRow.data!.rsvp_hidden_at, 'a zero-vote title is still hidden on un-RSVP').not.toBeNull()

    await admin!.from('votes').delete().in('suggestion_id', [a!.id, b!.id])
    await admin!.from('suggestions').delete().in('id', [a!.id, b!.id])
    await admin!.from('rsvps').delete().eq('user_id', uid)
    await admin!.from('invites').delete().eq('email', email)
    await admin!.from('events').delete().eq('id', soonId)
  })

  it('does not lock in a voted suggestion when the event is more than a week out', async () => {
    const { data: ev } = await admin!
      .from('events').insert({ title: 'Later', event_date: new Date(stamp + 30 * 86_400_000).toISOString() })
      .select('id').single()
    const farId = ev!.id

    const email = `rls_nolock_${stamp}@example.com`
    const uid = await makeUser(email)
    await admin!.from('invites').insert({ email })
    const client = await signInAs(email)
    await client.from('rsvps').insert({ event_id: farId, user_id: uid, status: 'going' })
    const { data: a } = await client.from('suggestions').insert({ event_id: farId, tmdb_movie: { id: 960, title: 'Early Bird' } }).select('id').single()
    await admin!.from('votes').insert({ suggestion_id: a!.id, user_id: memberId })

    await client.from('rsvps').update({ status: 'no' }).eq('event_id', farId).eq('user_id', uid)

    const aRow = await admin!.from('suggestions').select('rsvp_hidden_at').eq('id', a!.id).single()
    expect(aRow.data!.rsvp_hidden_at, 'a top title >1 week out is still hidden on un-RSVP').not.toBeNull()

    await admin!.from('votes').delete().eq('suggestion_id', a!.id)
    await admin!.from('suggestions').delete().eq('id', a!.id)
    await admin!.from('rsvps').delete().eq('user_id', uid)
    await admin!.from('invites').delete().eq('email', email)
    await admin!.from('events').delete().eq('id', farId)
  })

  it('claim_freed_votes notifies a voter once when their pick leaves the ballot', async () => {
    await memberClient.from('rsvps').upsert({ event_id: eventId, user_id: memberId, status: 'going' }, { onConflict: 'event_id,user_id' })
    const { data: s } = await admin!
      .from('suggestions').insert({ event_id: eventId, user_id: adminUserId, tmdb_movie: { id: 970, title: 'Refunded' } })
      .select('id').single()
    await memberClient.from('votes').insert({ suggestion_id: s!.id })

    // On the ballot → nothing to refund.
    const before = await memberClient.rpc('claim_freed_votes', { p_event_id: eventId })
    expect((before.data ?? []).find(r => r.suggestion_id === s!.id), 'no refund while on the ballot').toBeFalsy()

    // Cull it → the member's vote is freed.
    await admin!.from('suggestions').update({ culled_at: new Date().toISOString() }).eq('id', s!.id)

    const first = await memberClient.rpc('claim_freed_votes', { p_event_id: eventId })
    expect((first.data ?? []).find(r => r.suggestion_id === s!.id)?.title, 'the freed pick is reported once').toBe('Refunded')
    const second = await memberClient.rpc('claim_freed_votes', { p_event_id: eventId })
    expect((second.data ?? []).find(r => r.suggestion_id === s!.id), 'and never again').toBeFalsy()

    await admin!.from('vote_refund_acks').delete().eq('user_id', memberId)
    await admin!.from('votes').delete().eq('user_id', memberId).eq('suggestion_id', s!.id)
    await admin!.from('suggestions').delete().eq('id', s!.id)
  })

  it('set_suggestion_blurb: author can set/clear, others cannot, length-capped', async () => {
    const { data: mine } = await admin!
      .from('suggestions').insert({ event_id: eventId, user_id: memberId, tmdb_movie: { id: 980, title: 'Blurbed' } })
      .select('id').single()
    const sid = mine!.id

    // Author sets it — trimmed and stored.
    const set = await memberClient.rpc('set_suggestion_blurb', { p_suggestion_id: sid, p_blurb: '  My desert-island pick.  ' })
    expect(set.error, 'the author can set their blurb').toBeNull()
    const after = await admin!.from('suggestions').select('blurb').eq('id', sid).single()
    expect(after.data!.blurb, 'blurb is trimmed + stored').toBe('My desert-island pick.')

    // An allowlisted non-author can't edit someone else's blurb.
    const { data: theirs } = await admin!
      .from('suggestions').insert({ event_id: eventId, user_id: adminUserId, tmdb_movie: { id: 981, title: 'NotMine' } })
      .select('id').single()
    const notMine = await memberClient.rpc('set_suggestion_blurb', { p_suggestion_id: theirs!.id, p_blurb: 'hijack' })
    expect(notMine.error, 'a non-author is rejected even when allowlisted').toBeTruthy()

    // A non-allowlisted user can't either.
    const outsider = await outsiderClient.rpc('set_suggestion_blurb', { p_suggestion_id: sid, p_blurb: 'nope' })
    expect(outsider.error, 'a non-allowlisted user is rejected').toBeTruthy()

    // Over the 500-char cap is rejected.
    const tooLong = await memberClient.rpc('set_suggestion_blurb', { p_suggestion_id: sid, p_blurb: 'x'.repeat(501) })
    expect(tooLong.error, 'over 500 chars is rejected').toBeTruthy()

    // Whitespace clears it to null.
    const cleared = await memberClient.rpc('set_suggestion_blurb', { p_suggestion_id: sid, p_blurb: '   ' })
    expect(cleared.error).toBeNull()
    const empty = await admin!.from('suggestions').select('blurb').eq('id', sid).single()
    expect(empty.data!.blurb, 'empty/whitespace clears to null').toBeNull()

    await admin!.from('suggestions').delete().in('id', [sid, theirs!.id])
  })

  it('mirrors a member’s in-app RSVP into their e-vite row (set / change / clear)', async () => {
    const email = `rls_sync_${stamp}@example.com`
    const uid = await makeUser(email)
    await admin!.from('invites').insert({ email })
    const client = await signInAs(email)
    // The member is on this event's e-vite list, not yet responded.
    await admin!.from('event_invites').insert({ event_id: eventId, email })

    // In-app RSVP → mirrored to the e-vite row.
    await client.from('rsvps').upsert({ event_id: eventId, user_id: uid, status: 'going' }, { onConflict: 'event_id,user_id' })
    let row = await admin!.from('event_invites').select('rsvp, rsvp_at').eq('event_id', eventId).eq('email', email).single()
    expect(row.data!.rsvp, 'in-app going mirrors to the e-vite row').toBe('going')
    expect(row.data!.rsvp_at, 'and stamps a response time').not.toBeNull()

    // Changing the in-app answer updates the e-vite row.
    await client.from('rsvps').update({ status: 'maybe' }).eq('event_id', eventId).eq('user_id', uid)
    row = await admin!.from('event_invites').select('rsvp').eq('event_id', eventId).eq('email', email).single()
    expect(row.data!.rsvp, 'a changed answer is mirrored').toBe('maybe')

    // Clearing the in-app RSVP resets them to "no reply".
    await client.from('rsvps').delete().eq('event_id', eventId).eq('user_id', uid)
    row = await admin!.from('event_invites').select('rsvp, rsvp_at').eq('event_id', eventId).eq('email', email).single()
    expect(row.data!.rsvp, 'un-RSVP clears the e-vite response').toBeNull()
    expect(row.data!.rsvp_at, 'and the response time').toBeNull()

    await admin!.from('event_invites').delete().eq('event_id', eventId).eq('email', email)
    await admin!.from('rsvps').delete().eq('user_id', uid)
    await admin!.from('invites').delete().eq('email', email)
  })
})

describe.skipIf(!ready)('e-vite adopts an existing in-app RSVP on insert', () => {
  const stamp = Date.now()
  const goingEmail = `evite_going_${stamp}@example.com`
  const explicitEmail = `evite_explicit_${stamp}@example.com`
  const myUserIds: string[] = []
  let eventId = ''

  beforeAll(async () => {
    const goingId = await makeUser(goingEmail)
    const explicitId = await makeUser(explicitEmail)
    myUserIds.push(goingId, explicitId)
    await admin!.from('invites').insert([{ email: goingEmail }, { email: explicitEmail }])
    const { data: ev, error } = await admin!
      .from('events')
      .insert({ title: 'Sync-Back Night', event_date: new Date(stamp + 7 * 86_400_000).toISOString() })
      .select('id')
      .single()
    if (error || !ev) throw error ?? new Error('event seed failed')
    eventId = ev.id
    // Both members RSVP in-app BEFORE any e-vite row exists — the reminder-gap
    // scenario: the rsvps→evite trigger has nothing to update yet.
    const { error: rsvpError } = await admin!.from('rsvps').insert([
      { event_id: eventId, user_id: goingId, status: 'going' },
      { event_id: eventId, user_id: explicitId, status: 'going' }
    ])
    if (rsvpError) throw rsvpError
  }, 30_000)

  afterAll(async () => {
    if (!admin) return
    await admin.from('events').delete().eq('id', eventId)
    await admin.from('invites').delete().in('email', [goingEmail, explicitEmail])
    for (const id of myUserIds) await admin.auth.admin.deleteUser(id)
  })

  it('an invite created after the member RSVP\'d in-app adopts their response (case-insensitive)', async () => {
    const { data, error } = await admin!
      .from('event_invites')
      .insert({ event_id: eventId, email: goingEmail.toUpperCase() })
      .select('rsvp, rsvp_at')
      .single()
    expect(error).toBeNull()
    expect(data?.rsvp, 'invite adopts the in-app RSVP so reminders skip them').toBe('going')
    expect(data?.rsvp_at).toBeTruthy()
  })

  it('an invite for an email with no in-app RSVP stays a non-responder', async () => {
    const { data, error } = await admin!
      .from('event_invites')
      .insert({ event_id: eventId, email: `evite_quiet_${stamp}@example.com` })
      .select('rsvp')
      .single()
    expect(error).toBeNull()
    expect(data?.rsvp).toBeNull()
  })

  it('an explicitly-set rsvp on insert is not clobbered by the member\'s in-app response', async () => {
    const { data, error } = await admin!
      .from('event_invites')
      .insert({ event_id: eventId, email: explicitEmail, rsvp: 'no' })
      .select('rsvp')
      .single()
    expect(error).toBeNull()
    expect(data?.rsvp).toBe('no')
  })
})
