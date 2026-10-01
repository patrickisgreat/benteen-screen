// @vitest-environment nuxt
import { beforeEach, describe, expect, it } from 'vitest'
import { fakeApi } from './utils/fakeApi'

const api = fakeApi(['/api/invites/send'], () => ({ ok: true, emailed: true }))

beforeEach(() => api.reset())

describe('useInvites', () => {
  it('POSTs the email and name to the invite endpoint', async () => {
    const { sendInvite } = useInvites()
    const res = await sendInvite('a@b.com', 'Al')
    expect(api.calls[0]).toMatchObject({
      url: '/api/invites/send',
      method: 'POST',
      body: { email: 'a@b.com', name: 'Al' }
    })
    expect(res.emailed).toBe(true)
  })
})
