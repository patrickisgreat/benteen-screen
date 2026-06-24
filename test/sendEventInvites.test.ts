import { beforeEach, describe, expect, it, vi } from 'vitest'
import { sendEventInvites } from '../server/utils/email'

// Mock the Resend SDK so the real sendBatch runs without hitting the network — we
// drive what message ids (or errors) come back per batch and assert how the route's
// orchestration chunks, paces, allowlists, and stamps.
const { batchSend } = vi.hoisted(() => ({ batchSend: vi.fn() }))
vi.mock('resend', () => ({
  Resend: class {
    batch = { send: batchSend }
  }
}))

type Row = Record<string, unknown>
interface UpsertCall { rows: Row[], opts: Record<string, unknown> }

// A test double for the RLS-scoped Supabase client: only the `.from(table).upsert()`
// surface that sendEventInvites touches is implemented, recording each call.
function makeFakeDb(errors: { allowlistError?: string, stampError?: string } = {}) {
  const calls = { allowlist: [] as UpsertCall[], stamp: [] as UpsertCall[] }
  const upsertFor = (table: string) => (rows: Row[], opts: Record<string, unknown>) => {
    if (table === 'invites') {
      calls.allowlist.push({ rows, opts })
      return Promise.resolve({ error: errors.allowlistError ? { message: errors.allowlistError } : null })
    }
    if (table === 'event_invites') {
      calls.stamp.push({ rows, opts })
      return Promise.resolve({ error: errors.stampError ? { message: errors.stampError } : null })
    }
    throw new Error(`unexpected table ${table}`)
  }
  const from = (table: string) => ({ upsert: upsertFor(table) })
  // Cast at this test boundary: sendEventInvites only uses `.from().upsert()`.
  return { db: { from } as unknown as Parameters<typeof sendEventInvites>[0], calls }
}

const recipient = (id: string, email: string) => ({
  id,
  email,
  token: `tok-${id}`,
  displayName: null,
  subject: 'You are invited',
  html: `<p>${email}</p>`,
  text: email
})

const baseOpts = {
  apiKey: 'key',
  from: 'movie@night',
  replyTo: 'host@x',
  eventId: 'evt-1',
  invitedBy: 'admin-1',
  interBatchMs: 0 // no real delay between batches in tests
}

const okWith = (...ids: string[]) => ({ data: { data: ids.map(id => ({ id })) }, error: null })

beforeEach(() => {
  batchSend.mockReset()
  // The error/fail paths log intentionally (Invariant: don't swallow) — quiet them.
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('sendEventInvites', () => {
  it('sends one batch, allowlists everyone, and stamps every row in a SINGLE upsert', async () => {
    batchSend.mockResolvedValue(okWith('re_a', 're_b'))
    const { db, calls } = makeFakeDb()

    const res = await sendEventInvites(db, { ...baseOpts, recipients: [recipient('1', 'a@x'), recipient('2', 'b@x')] })

    expect(batchSend).toHaveBeenCalledTimes(1)
    expect(calls.allowlist).toHaveLength(1)
    expect(calls.allowlist[0]!.rows).toEqual([
      { email: 'a@x', display_name: null, invited_by: 'admin-1' },
      { email: 'b@x', display_name: null, invited_by: 'admin-1' }
    ])
    // One upsert carries both rows — not one update per recipient (the perf fix).
    expect(calls.stamp).toHaveLength(1)
    expect(calls.stamp[0]!.rows).toHaveLength(2)
    expect(calls.stamp[0]!.opts).toEqual({ onConflict: 'id' })
    expect(res).toEqual({ sent: 2, failed: 0, error: null })
  })

  it('stamps each row with its positionally-aligned Resend id, the NOT NULL columns, and one shared sent_at', async () => {
    batchSend.mockResolvedValue(okWith('re_a', 're_b'))
    const { db, calls } = makeFakeDb()

    await sendEventInvites(db, { ...baseOpts, recipients: [recipient('1', 'a@x'), recipient('2', 'b@x')] })

    expect(calls.stamp[0]!.rows[0]).toMatchObject({ id: '1', event_id: 'evt-1', email: 'a@x', token: 'tok-1', resend_id: 're_a' })
    expect(calls.stamp[0]!.rows[1]).toMatchObject({ id: '2', event_id: 'evt-1', email: 'b@x', token: 'tok-2', resend_id: 're_b' })
    expect(calls.stamp[0]!.rows[0]!.sent_at).toBe(calls.stamp[0]!.rows[1]!.sent_at)
  })

  it('stores a null resend_id when Resend returned no id for that recipient', async () => {
    batchSend.mockResolvedValue(okWith('re_a')) // one id for two recipients
    const { db, calls } = makeFakeDb()

    await sendEventInvites(db, { ...baseOpts, recipients: [recipient('1', 'a@x'), recipient('2', 'b@x')] })

    expect(calls.stamp[0]!.rows[0]!.resend_id).toBe('re_a')
    expect(calls.stamp[0]!.rows[1]!.resend_id).toBeNull()
  })

  it('splits a list larger than the batch size into multiple Resend requests', async () => {
    batchSend.mockResolvedValue(okWith('re'))
    const { db, calls } = makeFakeDb()

    const res = await sendEventInvites(db, {
      ...baseOpts,
      batchSize: 2,
      recipients: [recipient('1', 'a@x'), recipient('2', 'b@x'), recipient('3', 'c@x')]
    })

    expect(batchSend).toHaveBeenCalledTimes(2)
    expect(calls.stamp).toHaveLength(2)
    expect(calls.stamp[0]!.rows).toHaveLength(2)
    expect(calls.stamp[1]!.rows).toHaveLength(1)
    expect(res.sent).toBe(3)
  })

  it('counts a Resend-rejected batch as failed, surfaces the error, and never stamps it', async () => {
    batchSend
      .mockResolvedValueOnce({ data: null, error: { message: 'domain not verified' } }) // batch 1 fails
      .mockResolvedValueOnce(okWith('re')) // batch 2 succeeds
    const { db, calls } = makeFakeDb()

    const res = await sendEventInvites(db, {
      ...baseOpts,
      batchSize: 1,
      recipients: [recipient('1', 'a@x'), recipient('2', 'b@x')]
    })

    expect(res).toEqual({ sent: 1, failed: 1, error: 'domain not verified' })
    // The failed batch was neither allowlisted nor stamped; only the surviving one was.
    expect(calls.allowlist).toHaveLength(1)
    expect(calls.stamp).toHaveLength(1)
    expect(calls.stamp[0]!.rows[0]!.id).toBe('2')
  })

  it('flags a batch as failed when the email sent but the stamp upsert failed (the at-least-once gap)', async () => {
    batchSend.mockResolvedValue(okWith('re_a'))
    const { db } = makeFakeDb({ stampError: 'db unavailable' })

    const res = await sendEventInvites(db, { ...baseOpts, recipients: [recipient('1', 'a@x')] })

    expect(res.sent).toBe(0)
    expect(res.failed).toBe(1)
    expect(res.error).toContain('could not record delivery')
  })

  it('still stamps and counts the send when the best-effort allowlist upsert fails', async () => {
    batchSend.mockResolvedValue(okWith('re_a'))
    const { db, calls } = makeFakeDb({ allowlistError: 'allowlist boom' })

    const res = await sendEventInvites(db, { ...baseOpts, recipients: [recipient('1', 'a@x')] })

    expect(res).toEqual({ sent: 1, failed: 0, error: null })
    expect(calls.stamp).toHaveLength(1) // stamping proceeded despite the allowlist error
  })

  it('does nothing for an empty recipient list', async () => {
    const { db, calls } = makeFakeDb()

    const res = await sendEventInvites(db, { ...baseOpts, recipients: [] })

    expect(batchSend).not.toHaveBeenCalled()
    expect(calls.allowlist).toHaveLength(0)
    expect(calls.stamp).toHaveLength(0)
    expect(res).toEqual({ sent: 0, failed: 0, error: null })
  })

  it('waits between batches so a multi-batch blast stays under the rate limit', async () => {
    vi.useFakeTimers()
    try {
      batchSend.mockResolvedValue(okWith('re'))
      const { db } = makeFakeDb()

      const pending = sendEventInvites(db, {
        ...baseOpts,
        batchSize: 1,
        interBatchMs: 250,
        recipients: [recipient('1', 'a@x'), recipient('2', 'b@x')]
      })

      await vi.advanceTimersByTimeAsync(0)
      expect(batchSend).toHaveBeenCalledTimes(1) // first batch out, second parked on the gap

      await vi.advanceTimersByTimeAsync(250)
      await pending
      expect(batchSend).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })
})
