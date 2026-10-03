import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock the Resend SDK's batch endpoint (sendAnnounce → sendBatch → batch.send):
// every recipient gets their own email, 100 per request.
const { batchSend } = vi.hoisted(() => ({ batchSend: vi.fn() }))
vi.mock('resend', () => ({
  Resend: class {
    batch = { send: batchSend }
  }
}))

const { sendAnnounce } = await import('../server/utils/email')

interface SentItem { to: string, bcc?: string[], subject: string, html: string, replyTo?: string }

const mails = (n: number) => Array.from({ length: n }, (_, i) => ({
  email: `u${i}@x.com`,
  inviteId: i % 2 === 0 ? `inv-${i}` : null,
  subject: 's',
  html: `<p>Hi u${i}</p>`,
  text: `Hi u${i}`
}))
// Skip the inter-batch delay so tests don't actually wait.
const base = { apiKey: 'key', from: 'from@x', interBatchMs: 0 }
/** Resend accepts a batch: one id per item, in order. */
const accept = (items: SentItem[]) => ({ data: { data: items.map(item => ({ id: `re_${item.to}` })) }, error: null })

beforeEach(() => {
  batchSend.mockReset()
  batchSend.mockImplementation((items: SentItem[]) => Promise.resolve(accept(items)))
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('sendAnnounce', () => {
  it('sends each recipient their own email, addressed to them — never a shared BCC', async () => {
    await sendAnnounce({ ...base, replyTo: 'host@x', recipients: mails(3) })
    expect(batchSend).toHaveBeenCalledTimes(1)
    const items = batchSend.mock.calls[0]![0] as SentItem[]
    expect(items.map(item => item.to)).toEqual(['u0@x.com', 'u1@x.com', 'u2@x.com'])
    for (const item of items) expect(item.bcc).toBeUndefined()
    // Each copy carries that recipient's own body, and replies go to the host.
    expect(items[1]!.html).toBe('<p>Hi u1</p>')
    expect(items[1]!.replyTo).toBe('host@x')
  })

  it('splits a large audience into batch requests of 100', async () => {
    const res = await sendAnnounce({ ...base, recipients: mails(120) })
    expect(batchSend.mock.calls.map(c => (c[0] as SentItem[]).length)).toEqual([100, 20])
    expect(res.sent).toBe(120)
    expect(res.failed).toBe(0)
  })

  it('returns one message per accepted email, tied to the guest row when there is one', async () => {
    const res = await sendAnnounce({ ...base, recipients: mails(2) })
    expect(res.messages).toEqual([
      { resendId: 're_u0@x.com', email: 'u0@x.com', inviteId: 'inv-0' },
      { resendId: 're_u1@x.com', email: 'u1@x.com', inviteId: null }
    ])
  })

  it('continues past a failed batch and reports partial delivery (not a total failure)', async () => {
    batchSend
      .mockImplementationOnce((items: SentItem[]) => Promise.resolve(accept(items))) // batch 1 ok
      .mockRejectedValueOnce(new Error('Too many requests')) // batch 2 fails
      .mockImplementationOnce((items: SentItem[]) => Promise.resolve(accept(items))) // batch 3 ok
    const res = await sendAnnounce({ ...base, batchSize: 2, recipients: mails(5) })
    expect(res).toMatchObject({ sent: 3, failed: 2, error: 'Too many requests' })
    expect(res.messages.map(m => m.email)).toEqual(['u0@x.com', 'u1@x.com', 'u4@x.com'])
  })

  it('counts a recipient Resend returned no id for as failed', async () => {
    batchSend.mockResolvedValue({ data: { data: [{ id: 're_1' }] }, error: null }) // one id for two recipients
    const res = await sendAnnounce({ ...base, recipients: mails(2) })
    expect(res).toMatchObject({ sent: 1, failed: 1, error: null })
  })

  it('sends nothing for an empty recipient list', async () => {
    const res = await sendAnnounce({ ...base, recipients: [] })
    expect(batchSend).not.toHaveBeenCalled()
    expect(res).toEqual({ sent: 0, failed: 0, error: null, messages: [] })
  })
})
