// @vitest-environment nuxt
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

interface FetchCall { url: string, opts: { method?: string, body?: unknown } }
const calls: FetchCall[] = []

beforeEach(() => {
  calls.length = 0
  vi.stubGlobal('$fetch', (url: string, opts: { method?: string, body?: unknown }) => {
    calls.push({ url, opts })
    return Promise.resolve({ ok: true, emailed: true })
  })
})
afterEach(() => vi.unstubAllGlobals())

describe('useInvites', () => {
  it('POSTs the email and name to the invite endpoint', async () => {
    const { sendInvite } = useInvites()
    const res = await sendInvite('a@b.com', 'Al')
    expect(calls[0]).toMatchObject({
      url: '/api/invites/send',
      opts: { method: 'POST', body: { email: 'a@b.com', name: 'Al' } }
    })
    expect(res.emailed).toBe(true)
  })
})
