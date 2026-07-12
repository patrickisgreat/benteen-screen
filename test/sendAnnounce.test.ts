import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock the Resend SDK's batch endpoint (sendAnnounce → sendBatch → batch.send).
const { batchSend } = vi.hoisted(() => ({ batchSend: vi.fn() }))
vi.mock('resend', () => ({
  Resend: class {
    batch = { send: batchSend }
  }
}))

const { sendAnnounce } = await import('../server/utils/email')

const params = { subject: 's', html: '<p>h</p>', text: 't' }
const recipients = (n: number): string[] => Array.from({ length: n }, (_, i) => `u${i}@x.com`)
// Skip the inter-batch delay so tests don't actually wait.
const opts = { interBatchMs: 0 }

const acceptAll = (items: unknown[]) =>
  Promise.resolve({ data: { data: items.map((_, i) => ({ id: `re_${i}` })) }, error: null })

beforeEach(() => {
  batchSend.mockReset()
  batchSend.mockImplementation(acceptAll)
})

describe('sendAnnounce', () => {
  it('sends one email per recipient in batches of 100', async () => {
    const res = await sendAnnounce('key', 'from@x', params, recipients(120), opts)
    expect(batchSend).toHaveBeenCalledTimes(2)
    const batches = batchSend.mock.calls.map(c => c[0] as Array<{ to: string, bcc?: string[] }>)
    expect(batches.map(b => b.length)).toEqual([100, 20])
    // Each recipient gets their own email — no BCC, addresses never shared.
    expect(batches[0]![0]).toMatchObject({ to: 'u0@x.com', subject: 's' })
    for (const b of batches) for (const item of b) expect(item.bcc).toBeUndefined()
    expect(res.sent).toBe(120)
    expect(res.failed).toBe(0)
    expect(res.error).toBeNull()
  })

  it('returns each accepted recipient with its Resend id for engagement rows', async () => {
    const res = await sendAnnounce('key', 'from@x', params, recipients(2), opts)
    expect(res.recipients).toEqual([
      { email: 'u0@x.com', resendId: 're_0' },
      { email: 'u1@x.com', resendId: 're_1' }
    ])
  })

  it('continues past a failed batch and reports partial delivery (not a total failure)', async () => {
    batchSend
      .mockImplementationOnce(acceptAll) // batch 1 (100) ok
      .mockRejectedValueOnce(new Error('Unverified domain')) // batch 2 (20) fails
    const res = await sendAnnounce('key', 'from@x', params, recipients(120), opts)
    expect(res.sent).toBe(100)
    expect(res.failed).toBe(20)
    expect(res.error).toBe('Unverified domain')
    expect(res.recipients).toHaveLength(100)
  })

  it('sends nothing for an empty recipient list', async () => {
    const res = await sendAnnounce('key', 'from@x', params, [], opts)
    expect(batchSend).not.toHaveBeenCalled()
    expect(res).toEqual({ sent: 0, failed: 0, error: null, recipients: [] })
  })
})
