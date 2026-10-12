// @vitest-environment nuxt
import { beforeEach, describe, expect, it } from 'vitest'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'

interface RpcCall { fn: string, args: unknown }
interface Write { table: string, op: 'update' | 'upsert' | 'delete', payload?: unknown, filter?: { col: string, val: unknown } }
const calls: { rpc: RpcCall[], del: Array<{ col: string, val: unknown }>, writes: Write[] } = { rpc: [], del: [], writes: [] }
let profiles: unknown[] = []
let invites: unknown[] = []
let contacts: unknown[] = []
let profilesError: { message: string } | null = null
let invitesError: { message: string } | null = null

// The read chain (`select … order`) resolves to the table's fixture; the write
// chains (`update/upsert/delete … eq`) record what was written and where.
function from(table: string) {
  const data = table === 'profiles' ? profiles : table === 'invites' ? invites : contacts
  const error = table === 'profiles' ? profilesError : table === 'invites' ? invitesError : null
  const result = Promise.resolve({ data, error })
  const write = (op: Write['op'], payload?: unknown) => ({
    eq: (col: string, val: unknown) => {
      calls.writes.push({ table, op, payload, filter: { col, val } })
      if (op === 'delete') calls.del.push({ col, val })
      return Promise.resolve({ error: null })
    }
  })
  const chain: Record<string, unknown> = {
    select: () => chain,
    order: () => result,
    is: () => chain,
    update: (payload: unknown) => write('update', payload),
    delete: () => write('delete'),
    upsert: (payload: unknown, opts: unknown) => {
      calls.writes.push({ table, op: 'upsert', payload: { row: payload, opts } })
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
  calls.writes = []
  profiles = []
  invites = []
  contacts = []
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

  it('loads the admin-only contact records alongside people', async () => {
    contacts = [{ email: 'a@x.com', phone: '+15550000001', updated_at: '' }]
    const { contacts: loaded, setBlocked } = useAdminPeople()
    await setBlocked('u1', true) // triggers refresh()
    expect(loaded.value).toEqual(contacts)
  })

  it('updatePerson renames a member through the column-safe admin RPC and stores the number on contacts', async () => {
    const { updatePerson } = useAdminPeople()
    await updatePerson({ email: 'a@x.com', profileId: 'u1', displayName: '  Alice B  ', phone: '+15550000001' })
    expect(calls.rpc[0]).toEqual({ fn: 'admin_set_display_name', args: { target_id: 'u1', value: 'Alice B' } })
    expect(calls.writes).toContainEqual(expect.objectContaining({
      table: 'contacts', op: 'upsert', payload: expect.objectContaining({ row: expect.objectContaining({ email: 'a@x.com', phone: '+15550000001' }), opts: { onConflict: 'email' } })
    }))
    // Never writes the profile table directly (is_admin / blocked stay out of reach).
    expect(calls.writes.some(w => w.table === 'profiles')).toBe(false)
  })

  it('updatePerson renames a roster entry directly on invites', async () => {
    const { updatePerson } = useAdminPeople()
    await updatePerson({ email: 'pending@x.com', profileId: null, displayName: 'Pat', phone: null })
    expect(calls.rpc).toHaveLength(0)
    expect(calls.writes).toContainEqual({ table: 'invites', op: 'update', payload: { display_name: 'Pat' }, filter: { col: 'email', val: 'pending@x.com' } })
  })

  it('updatePerson clears the number by removing the contact record', async () => {
    const { updatePerson } = useAdminPeople()
    await updatePerson({ email: 'pending@x.com', profileId: null, displayName: 'Pat', phone: null })
    expect(calls.writes).toContainEqual({ table: 'contacts', op: 'delete', payload: undefined, filter: { col: 'email', val: 'pending@x.com' } })
  })

  it('updatePerson brings every guest-list row for that email in step', async () => {
    const { updatePerson } = useAdminPeople()
    await updatePerson({ email: 'a@x.com', profileId: 'u1', displayName: 'Alice', phone: '+15550000001' })
    expect(calls.writes).toContainEqual({ table: 'event_invites', op: 'update', payload: { display_name: 'Alice', phone: '+15550000001' }, filter: { col: 'email', val: 'a@x.com' } })
  })

  it('updatePerson refuses to blank a member\'s name', async () => {
    const { updatePerson } = useAdminPeople()
    await expect(updatePerson({ email: 'a@x.com', profileId: 'u1', displayName: '   ', phone: null })).rejects.toThrow(/display name/)
    expect(calls.rpc).toHaveLength(0)
  })
})
