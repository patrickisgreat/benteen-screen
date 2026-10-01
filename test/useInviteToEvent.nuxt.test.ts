// @vitest-environment nuxt
import { beforeEach, describe, expect, it } from 'vitest'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { fakeApi } from './utils/fakeApi'

const api = fakeApi(['/api/events/e1/invites/send'], () => ({ ok: true, sent: 1, failed: 0, error: null }))
const inserts: unknown[] = []
let insertError: { code: string, message: string } | null = null

const supabase = {
  from: () => ({
    insert: (row: unknown) => {
      inserts.push(row)
      return Promise.resolve({ error: insertError })
    }
  })
}
mockNuxtImport('useSupabaseClient', () => () => supabase)

const guest = { email: 'ada@x.com', display_name: 'Ada' }

beforeEach(() => {
  api.reset()
  inserts.length = 0
  insertError = null
})

describe('useInviteToEvent', () => {
  it('adds the guest to the event list without emailing when sendNow is off', async () => {
    const { inviteToEvent } = useInviteToEvent()
    const result = await inviteToEvent('e1', guest, false)
    expect(inserts[0]).toEqual({ event_id: 'e1', email: 'ada@x.com', display_name: 'Ada' })
    expect(api.calls).toHaveLength(0)
    expect(result).toEqual({ added: true, sent: 0, failed: 0, error: null })
  })

  it('e-vites only that guest when sendNow is on', async () => {
    const { inviteToEvent } = useInviteToEvent()
    const result = await inviteToEvent('e1', guest, true)
    expect(api.calls[0]).toMatchObject({ url: '/api/events/e1/invites/send', method: 'POST', body: { emails: ['ada@x.com'] } })
    expect(result).toMatchObject({ added: true, sent: 1 })
  })

  it('treats "already on the list" as fine and still sends', async () => {
    insertError = { code: '23505', message: 'duplicate' }
    const { inviteToEvent } = useInviteToEvent()
    const result = await inviteToEvent('e1', guest, true)
    expect(result.added).toBe(false)
    expect(api.calls).toHaveLength(1)
  })

  it('rethrows any other insert failure', async () => {
    insertError = { code: '42501', message: 'permission denied' }
    const { inviteToEvent } = useInviteToEvent()
    await expect(inviteToEvent('e1', guest, true)).rejects.toMatchObject({ code: '42501' })
    expect(api.calls).toHaveLength(0)
  })
})
