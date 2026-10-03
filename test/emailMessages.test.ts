import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock the Resend SDK's list endpoint (syncEmailStatuses → listEmailStatuses → emails.list).
const { emailsList } = vi.hoisted(() => ({ emailsList: vi.fn() }))
vi.mock('resend', () => ({
  Resend: class {
    emails = { list: emailsList }
  }
}))

const { impliedStamps, recordSend, stampEmailEvent, syncEmailStatuses } = await import('../server/utils/emailMessages')

type Row = Record<string, unknown>
type Db = Parameters<typeof recordSend>[0]

beforeEach(() => {
  emailsList.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('recordSend', () => {
  // Fake of the two writes recordSend makes: comms_log insert→select→single, then
  // the email_messages upsert.
  function makeDb(errors: { log?: string, messages?: string } = {}) {
    const calls = { log: [] as Row[], messages: [] as Row[][], upsertOpts: [] as Row[] }
    const from = (table: string) => {
      if (table === 'comms_log') {
        return {
          insert: (row: Row) => {
            calls.log.push(row)
            return {
              select: () => ({
                single: () => Promise.resolve(errors.log
                  ? { data: null, error: { message: errors.log } }
                  : { data: { id: 'log-1' }, error: null })
              })
            }
          }
        }
      }
      if (table === 'email_messages') {
        return {
          upsert: (rows: Row[], opts: Row) => {
            calls.messages.push(rows)
            calls.upsertOpts.push(opts)
            return Promise.resolve({ error: errors.messages ? { message: errors.messages } : null })
          }
        }
      }
      throw new Error(`unexpected table ${table}`)
    }
    // Cast at this test boundary: recordSend only uses the two chains above.
    return { db: { from } as unknown as Db, calls }
  }

  const send = {
    eventId: 'evt-1',
    kind: 'announcement' as const,
    scope: 'guests',
    subject: 'Doors at 7',
    sentBy: 'admin-1',
    sent: 2,
    failed: 1,
    error: 'one bounced',
    messages: [
      { resendId: 're_a', email: 'a@x', inviteId: 'inv-a' },
      { resendId: 're_b', email: 'b@x', inviteId: null }
    ]
  }

  it('logs the send with its outcome', async () => {
    const { db, calls } = makeDb()
    await recordSend(db, send)
    expect(calls.log).toEqual([{
      event_id: 'evt-1', kind: 'announcement', scope: 'guests', subject: 'Doors at 7',
      recipient_count: 2, failed_count: 1, status: 'partial', error: 'one bounced', sent_by: 'admin-1'
    }])
  })

  it('records one message per accepted email, linked to the log entry and the guest row', async () => {
    const { db, calls } = makeDb()
    await recordSend(db, send)
    expect(calls.messages).toEqual([[
      { resend_id: 're_a', event_id: 'evt-1', comms_log_id: 'log-1', invite_id: 'inv-a', kind: 'announcement', email: 'a@x' },
      { resend_id: 're_b', event_id: 'evt-1', comms_log_id: 'log-1', invite_id: null, kind: 'announcement', email: 'b@x' }
    ]])
    // A retried request must not fail on (or duplicate) messages already recorded.
    expect(calls.upsertOpts[0]).toEqual({ onConflict: 'resend_id', ignoreDuplicates: true })
  })

  it('still records the messages (unlinked) when the log entry could not be written', async () => {
    const { db, calls } = makeDb({ log: 'rls denied' })
    await recordSend(db, send)
    expect(calls.messages[0]!.map(m => m.comms_log_id)).toEqual([null, null])
  })

  it('logs a total failure without touching email_messages', async () => {
    const { db, calls } = makeDb()
    await recordSend(db, { ...send, sent: 0, failed: 3, messages: [] })
    expect(calls.log[0]).toMatchObject({ status: 'failed', recipient_count: 0, failed_count: 3 })
    expect(calls.messages).toHaveLength(0)
  })

  it('never throws when recording fails — the emails already went out', async () => {
    const { db } = makeDb({ log: 'down', messages: 'down' })
    await expect(recordSend(db, send)).resolves.toBeUndefined()
  })
})

describe('stampEmailEvent', () => {
  // Fake of `.from(table).update(patch, opts).eq('resend_id', id)` returning a row count.
  function makeDb(result: { messageCount?: number, messageError?: string, inviteCount?: number, inviteError?: string }) {
    const updates: Array<{ table: string, patch: Row, id: string }> = []
    const from = (table: string) => ({
      update: (patch: Row) => ({
        eq: (_column: string, id: string) => {
          updates.push({ table, patch, id })
          if (table === 'email_messages') {
            return Promise.resolve({ count: result.messageCount ?? 0, error: result.messageError ? { message: result.messageError } : null })
          }
          return Promise.resolve({ count: result.inviteCount ?? 0, error: result.inviteError ? { message: result.inviteError } : null })
        }
      })
    })
    return { db: { from } as unknown as Db, updates }
  }

  const at = new Date('2026-10-03T12:00:00Z')

  it('stamps the message row by Resend id and stops there', async () => {
    const { db, updates } = makeDb({ messageCount: 1 })
    expect(await stampEmailEvent(db, 'opened_at', 're_1', at)).toBe('message')
    expect(updates).toEqual([{ table: 'email_messages', patch: { opened_at: '2026-10-03T12:00:00.000Z' }, id: 're_1' }])
  })

  it('falls back to the guest row for an e-vite with no message row', async () => {
    const { db, updates } = makeDb({ messageCount: 0, inviteCount: 1 })
    expect(await stampEmailEvent(db, 'delivered_at', 're_1', at)).toBe('invite')
    expect(updates.map(u => u.table)).toEqual(['email_messages', 'event_invites'])
  })

  it('still reaches the guest row when the message table errors (e.g. not migrated yet)', async () => {
    const { db } = makeDb({ messageError: 'relation does not exist', inviteCount: 1 })
    expect(await stampEmailEvent(db, 'opened_at', 're_1', at)).toBe('invite')
  })

  it('reports an event that matches nothing', async () => {
    const { db } = makeDb({})
    expect(await stampEmailEvent(db, 'opened_at', 're_unknown', at)).toBe('unmatched')
  })

  it('throws when the guest-row fallback fails, so the caller can log it', async () => {
    const { db } = makeDb({ inviteError: 'boom' })
    await expect(stampEmailEvent(db, 'opened_at', 're_1', at)).rejects.toThrow('boom')
  })
})

describe('impliedStamps', () => {
  it('treats later events as proof of the earlier ones', () => {
    expect(impliedStamps('delivered')).toEqual(['delivered_at'])
    expect(impliedStamps('opened')).toEqual(['delivered_at', 'opened_at'])
    expect(impliedStamps('clicked')).toEqual(['delivered_at', 'opened_at', 'clicked_at'])
  })

  it('maps a bounce to bounced only, and in-flight states to nothing', () => {
    expect(impliedStamps('bounced')).toEqual(['bounced_at'])
    expect(impliedStamps('sent')).toEqual([])
    expect(impliedStamps('queued')).toEqual([])
    expect(impliedStamps('something_new')).toEqual([])
  })
})

describe('syncEmailStatuses', () => {
  interface Message { id: string, resend_id: string, delivered_at: string | null, opened_at: string | null, clicked_at: string | null, bounced_at: string | null }
  const message = (id: string, over: Partial<Message> = {}): Message => ({
    id, resend_id: `re_${id}`, delivered_at: null, opened_at: null, clicked_at: null, bounced_at: null, ...over
  })

  // Fake of the pending-messages select (a thenable query builder) and the
  // grouped `.update(patch).in('id', ids)` writes.
  function makeDb(pending: Message[], errors: { select?: string, update?: string } = {}) {
    const filters: Array<[string, string, unknown]> = []
    const updates: Array<{ patch: Row, ids: string[] }> = []
    const query = {
      gte: (column: string, value: unknown) => (filters.push(['gte', column, value]), query),
      is: (column: string, value: unknown) => (filters.push(['is', column, value]), query),
      eq: (column: string, value: unknown) => (filters.push(['eq', column, value]), query),
      then: (resolve: (result: unknown) => void) =>
        resolve(errors.select ? { data: null, error: { message: errors.select } } : { data: pending, error: null })
    }
    const from = () => ({
      select: () => query,
      update: (patch: Row) => ({
        in: (_column: string, ids: string[]) => {
          updates.push({ patch, ids })
          return Promise.resolve({ error: errors.update ? { message: errors.update } : null })
        }
      })
    })
    return { db: { from } as unknown as Db, filters, updates }
  }

  const page = (items: Array<[string, string]>, hasMore = false) => ({
    data: { data: items.map(([id, last_event]) => ({ id, last_event })), has_more: hasMore },
    error: null
  })
  const now = new Date('2026-10-03T12:00:00Z')
  const stamp = '2026-10-03T12:00:00.000Z'
  const opts = { now, pageGapMs: 0 }

  it('stamps what Resend reports, including the events a later one implies', async () => {
    const { db, updates } = makeDb([message('a'), message('b'), message('c')])
    emailsList.mockResolvedValue(page([['re_a', 'delivered'], ['re_b', 'opened'], ['re_c', 'bounced']]))

    const result = await syncEmailStatuses(db, 'key', opts)

    expect(updates).toEqual([
      { patch: { delivered_at: stamp }, ids: ['a'] },
      { patch: { delivered_at: stamp, opened_at: stamp }, ids: ['b'] },
      { patch: { bounced_at: stamp }, ids: ['c'] }
    ])
    expect(result).toEqual({ checked: 3, updated: 3 })
  })

  it('never overwrites a stamp the webhook already recorded', async () => {
    const { db, updates } = makeDb([message('a', { delivered_at: '2026-10-01T00:00:00Z' })])
    emailsList.mockResolvedValue(page([['re_a', 'opened']]))

    await syncEmailStatuses(db, 'key', opts)

    expect(updates).toEqual([{ patch: { opened_at: stamp }, ids: ['a'] }])
  })

  it('writes messages needing the same stamps in one update', async () => {
    const { db, updates } = makeDb([message('a'), message('b')])
    emailsList.mockResolvedValue(page([['re_a', 'delivered'], ['re_b', 'delivered']]))

    await syncEmailStatuses(db, 'key', opts)

    expect(updates).toEqual([{ patch: { delivered_at: stamp }, ids: ['a', 'b'] }])
  })

  it('is a no-op when nothing changed since the last sync', async () => {
    const { db, updates } = makeDb([message('a', { delivered_at: 't', opened_at: 't' })])
    emailsList.mockResolvedValue(page([['re_a', 'opened']]))

    expect(await syncEmailStatuses(db, 'key', opts)).toEqual({ checked: 1, updated: 0 })
    expect(updates).toHaveLength(0)
  })

  it('ignores emails in Resend that this app does not track, and in-flight ones', async () => {
    const { db, updates } = makeDb([message('a')])
    emailsList.mockResolvedValue(page([['re_someone_else', 'opened'], ['re_a', 'sent']]))

    expect(await syncEmailStatuses(db, 'key', opts)).toEqual({ checked: 1, updated: 0 })
    expect(updates).toHaveLength(0)
  })

  it('pages through Resend with the last id as the cursor until every message is found', async () => {
    const { db } = makeDb([message('a'), message('b')])
    emailsList
      .mockResolvedValueOnce(page([['re_a', 'delivered'], ['re_x', 'sent']], true))
      .mockResolvedValueOnce(page([['re_b', 'delivered'], ['re_y', 'sent']], true))

    const result = await syncEmailStatuses(db, 'key', opts)

    expect(emailsList).toHaveBeenCalledTimes(2) // stopped: both found, despite has_more
    expect(emailsList.mock.calls[0]![0]).toEqual({ limit: 100 })
    expect(emailsList.mock.calls[1]![0]).toEqual({ limit: 100, after: 're_x' })
    expect(result.updated).toBe(2)
  })

  it('stops paging at the page cap when a message is never found', async () => {
    const { db } = makeDb([message('a')])
    emailsList.mockResolvedValue(page([['re_x', 'sent']], true))

    await syncEmailStatuses(db, 'key', { ...opts, maxPages: 3 })

    expect(emailsList).toHaveBeenCalledTimes(3)
  })

  it('does not call Resend when there is nothing pending', async () => {
    const { db } = makeDb([])
    expect(await syncEmailStatuses(db, 'key', opts)).toEqual({ checked: 0, updated: 0 })
    expect(emailsList).not.toHaveBeenCalled()
  })

  it('only looks at the last 30 days of unfinished messages, scoped to the event when given', async () => {
    const { db, filters } = makeDb([])
    await syncEmailStatuses(db, 'key', { ...opts, eventId: 'evt-1' })
    expect(filters).toEqual([
      ['gte', 'sent_at', '2026-09-03T12:00:00.000Z'],
      ['is', 'clicked_at', null],
      ['is', 'bounced_at', null],
      ['eq', 'event_id', 'evt-1']
    ])
  })

  it('surfaces a Resend failure instead of reporting a clean sync', async () => {
    const { db } = makeDb([message('a')])
    emailsList.mockResolvedValue({ data: null, error: { message: 'invalid api key' } })
    await expect(syncEmailStatuses(db, 'key', opts)).rejects.toThrow('invalid api key')
  })

  it('surfaces a database failure on load and on write', async () => {
    await expect(syncEmailStatuses(makeDb([], { select: 'rls' }).db, 'key', opts)).rejects.toThrow('rls')

    emailsList.mockResolvedValue(page([['re_a', 'delivered']]))
    await expect(syncEmailStatuses(makeDb([message('a')], { update: 'denied' }).db, 'key', opts)).rejects.toThrow('denied')
  })
})
