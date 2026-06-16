// @vitest-environment nuxt
import { beforeEach, describe, expect, it } from 'vitest'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'

interface RpcCall { fn: string, args: unknown }
const calls: { rpc: RpcCall[] } = { rpc: [] }
let rows: unknown[] = []

const supabase = {
  from() {
    return { select: () => ({ order: () => Promise.resolve({ data: rows }) }) }
  },
  rpc: (fn: string, args: unknown) => {
    calls.rpc.push({ fn, args })
    return Promise.resolve({ error: null })
  }
}

mockNuxtImport('useSupabaseClient', () => () => supabase)

beforeEach(() => {
  calls.rpc = []
  rows = []
})

describe('useAdminPeople', () => {
  it('setBlocked bans via the admin RPC, then refreshes the directory', async () => {
    rows = [{ id: 'u1', email: 'a@x.com', display_name: 'Alice', avatar_url: null, is_admin: false, blocked: true, created_at: '' }]
    const { people, setBlocked } = useAdminPeople()
    await setBlocked('u1', true)
    expect(calls.rpc[0]).toEqual({ fn: 'admin_set_blocked', args: { target_id: 'u1', value: true } })
    expect(people.value).toHaveLength(1)
  })

  it('setBlocked unbans with value=false', async () => {
    const { setBlocked } = useAdminPeople()
    await setBlocked('u1', false)
    expect(calls.rpc[0]).toEqual({ fn: 'admin_set_blocked', args: { target_id: 'u1', value: false } })
  })
})
