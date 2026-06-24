import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock the Resend SDK so we assert how sendBatch calls it without hitting the network.
const { batchSend } = vi.hoisted(() => ({ batchSend: vi.fn() }))
vi.mock('resend', () => ({
  Resend: class {
    batch = { send: batchSend }
  }
}))

const { sendBatch } = await import('../server/utils/email')

const mail = (to: string) => ({ to, subject: 's', html: '<p>h</p>', text: 't' })

beforeEach(() => {
  batchSend.mockReset()
})

describe('sendBatch', () => {
  it('sends many distinct emails in a SINGLE Resend request (the rate-limit fix)', async () => {
    batchSend.mockResolvedValue({ data: { data: [{ id: 're_1' }, { id: 're_2' }] }, error: null })
    await sendBatch('key', 'movie@night', [mail('a@x'), mail('b@x')])
    expect(batchSend).toHaveBeenCalledTimes(1)
    expect(batchSend).toHaveBeenCalledWith([
      expect.objectContaining({ from: 'movie@night', to: 'a@x' }),
      expect.objectContaining({ from: 'movie@night', to: 'b@x' })
    ])
  })

  it('returns the message ids positionally aligned with the inputs', async () => {
    batchSend.mockResolvedValue({ data: { data: [{ id: 're_1' }, { id: 're_2' }] }, error: null })
    const { ids } = await sendBatch('key', 'from@x', [mail('a@x'), mail('b@x')])
    expect(ids).toEqual(['re_1', 're_2'])
  })

  it('pads missing ids with null so callers can still correlate by position', async () => {
    batchSend.mockResolvedValue({ data: { data: [{ id: 're_1' }] }, error: null })
    const { ids } = await sendBatch('key', 'from@x', [mail('a@x'), mail('b@x')])
    expect(ids).toEqual(['re_1', null])
  })

  it('forwards the per-recipient fields (replyTo included) to Resend', async () => {
    batchSend.mockResolvedValue({ data: { data: [{ id: 're_1' }] }, error: null })
    await sendBatch('key', 'from@x', [{ to: 'a@x', subject: 'Sub', html: '<p>H</p>', text: 'T', replyTo: 'me@x' }])
    expect(batchSend).toHaveBeenCalledWith([
      { from: 'from@x', to: 'a@x', bcc: undefined, subject: 'Sub', html: '<p>H</p>', text: 'T', replyTo: 'me@x' }
    ])
  })

  it('throws the Resend error message so the caller records the real failure', async () => {
    batchSend.mockResolvedValue({ data: null, error: { message: 'domain not verified' } })
    await expect(sendBatch('key', 'from@x', [mail('a@x')])).rejects.toThrow('domain not verified')
  })

  it('skips the network call entirely for an empty list', async () => {
    const { ids } = await sendBatch('key', 'from@x', [])
    expect(batchSend).not.toHaveBeenCalled()
    expect(ids).toEqual([])
  })
})
