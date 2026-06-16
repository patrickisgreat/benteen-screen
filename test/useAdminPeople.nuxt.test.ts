// @vitest-environment nuxt
import { beforeEach, describe, expect, it } from 'vitest'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'

interface RpcCall { fn: string, args: unknown }
const calls: { rpc: RpcCall[], del: Array<{ col: string, val: unknown }> } = { rpc: [], del: [] }
let profiles: unknown[] = []
let invites: unknown[] = []
let profilesError: { message: string } | null = null
let invitesError: { message: string } | null = null

function from(table: string) {
  const data = table === 'profiles' ? profiles : invites
  const error = table === 'profiles' ? profilesError : invitesError
  const result = Promise.resolve({ data, error })
  const chain: Record<string, unknown> = {
    select: () => chain,
    order: () => result,
    is: () => chain,
    delete: () => chain,
    eq: (col: string, val: unknown) => {
      calls.del.push({ col, val })
      return Promise.resolve({ error: null })
    }
  }
  return chain
}

const supabase = {
  from,
  rpc: (fn: string, args: unknown) => {
    calls.rpc.push({ fn, args })
    return Promise.resolve({ error: null })
  }
}

mockNuxtImport('useSupabaseClient', () => () => supabase)

beforeEach(() => {
  calls.rpc = []
  calls.del = []
  profiles = []
  invites = []
  profilesError = null
  invitesError = null
})

describe('useAdminPeople', () => {
  it('loads members and pending invites together', async () => {
    profiles = [{ id: 'u1', email: 'a@x.com', display_name: 'Alice', avatar_url: null, is_admin: false, blocked: false, created_at: '' }]
    invites = [{ email: 'pending@x.com', invited_by: 'u1', display_name: 'Pat', created_at: '', accepted_at: null }]
    const { people, pendingInvites, setBlocked } = useAdminPeople()
    await setBlocked('u1', true) // triggers refresh()
    expect(people.value).toHaveLength(1)
    expect(pendingInvites.value).toHaveLength(1)
  })

  it('surfaces a load error instead of a silent empty list', async () => {
    invitesError = { message: 'permission denied' }
    const { loadError, setBlocked } = useAdminPeople()
    await setBlocked('u1', true)
    expect(loadError.value).toBe('permission denied')
  })

  it('setBlocked bans via the admin RPC', async () => {
    const { setBlocked } = useAdminPeople()
    await setBlocked('u1', true)
    expect(calls.rpc[0]).toEqual({ fn: 'admin_set_blocked', args: { target_id: 'u1', value: true } })
  })

  it('setAdmin grants admin via the admin RPC', async () => {
    const { setAdmin } = useAdminPeople()
    await setAdmin('u1', true)
    expect(calls.rpc[0]).toEqual({ fn: 'admin_set_admin', args: { target_id: 'u1', value: true } })
  })

  it('setAdmin revokes admin via the admin RPC', async () => {
    const { setAdmin } = useAdminPeople()
    await setAdmin('u2', false)
    expect(calls.rpc[0]).toEqual({ fn: 'admin_set_admin', args: { target_id: 'u2', value: false } })
  })

  it('revokeInvite deletes the invite by email', async () => {
    const { revokeInvite } = useAdminPeople()
    await revokeInvite('pending@x.com')
    expect(calls.del).toContainEqual({ col: 'email', val: 'pending@x.com' })
  })
})
