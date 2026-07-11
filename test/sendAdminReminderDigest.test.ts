import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock Resend's single-send endpoint — the digest is one BCC email to the admins.
const { emailsSend } = vi.hoisted(() => ({ emailsSend: vi.fn() }))
vi.mock('resend', () => ({
  Resend: class {
    emails = { send: emailsSend }
  }
}))

const { sendAdminReminderDigest } = await import('../server/utils/email')

// Minimal db stub: profiles.select('email').eq('is_admin', true) resolves to `adminRows`.
let adminRows: Array<{ email: string | null }> = []
const db = {
  from() {
    return {
      select: () => ({
        eq: (_col: string, _val: unknown) => Promise.resolve({ data: adminRows, error: null })
      })
    }
  }
} as never

const baseOpts = {
  apiKey: 'key',
  from: 'movienight@x',
  items: [{ eventTitle: 'Jaws', eventDate: 'Friday', daysLeft: 3, remindedCount: 4 }],
  totalReminded: 4,
  adminUrl: 'https://x/admin'
}

beforeEach(() => {
  emailsSend.mockReset()
  emailsSend.mockResolvedValue({ data: { id: 're_1' }, error: null })
  adminRows = []
})

describe('sendAdminReminderDigest', () => {
  it('BCCs every admin with the run summary, hiding addresses behind the sender', async () => {
    adminRows = [{ email: 'a@x.com' }, { email: 'b@x.com' }]
    const res = await sendAdminReminderDigest(db, baseOpts)

    expect(emailsSend).toHaveBeenCalledTimes(1)
    const sent = emailsSend.mock.calls[0]![0] as { to: string, bcc: string[], subject: string }
    expect(sent.to).toBe('movienight@x') // real recipients stay in BCC
    expect(sent.bcc).toEqual(['a@x.com', 'b@x.com'])
    expect(sent.subject).toContain('4 people nudged')
    expect(res).toEqual({ notified: 2 })
  })

  it('de-duplicates and normalizes admin emails before sending', async () => {
    adminRows = [{ email: 'A@x.com' }, { email: 'a@x.com' }, { email: null }]
    const res = await sendAdminReminderDigest(db, baseOpts)
    const sent = emailsSend.mock.calls[0]![0] as { bcc: string[] }
    expect(sent.bcc).toEqual(['a@x.com'])
    expect(res).toEqual({ notified: 1 })
  })

  it('sends nothing when there are no admins', async () => {
    adminRows = []
    const res = await sendAdminReminderDigest(db, baseOpts)
    expect(emailsSend).not.toHaveBeenCalled()
    expect(res).toEqual({ notified: 0 })
  })
})
