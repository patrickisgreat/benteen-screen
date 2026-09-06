// @vitest-environment nuxt
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'

interface FetchCall { url: string, opts: { method?: string, body?: unknown } }
const calls: FetchCall[] = []

let rows: Array<Record<string, unknown>> = []
let loadError: { message: string } | null = null

// Only the `.from('invites').select().order()` chain useRoster touches.
mockNuxtImport('useSupabaseClient', () => () => ({
  from: () => ({
    select: () => ({
      order: () => Promise.resolve({ data: loadError ? null : rows, error: loadError })
    })
  })
}))

const person = (email: string, accepted: string | null) => ({
  email,
  invited_by: null,
  display_name: null,
  created_at: '2026-01-01',
  accepted_at: accepted
})

beforeEach(() => {
  calls.length = 0
  loadError = null
  rows = [person('sam@x.com', '2026-01-02'), person('jo@x.com', null)]
  vi.stubGlobal('$fetch', (url: string, opts: { method?: string, body?: unknown }) => {
    calls.push({ url, opts })
    return Promise.resolve({ ok: true, added: 1, skipped: 0, emailed: 1, failed: 0, invalid: [], error: null })
  })
})
afterEach(() => vi.unstubAllGlobals())

describe('useRoster', () => {
  it('loads the whole allowlist, joined and pending alike', async () => {
    const { roster, refresh } = useRoster()
    await refresh()
    expect(roster.value.map(r => r.email)).toEqual(['sam@x.com', 'jo@x.com'])
  })

  it('counts only the people who have not signed in yet', async () => {
    const { pendingCount, refresh } = useRoster()
    await refresh()
    expect(pendingCount.value).toBe(1)
  })

  it('exposes existing emails lowercased so the composer can skip them', async () => {
    rows = [person('SAM@X.com', null)]
    const { existingEmails, refresh } = useRoster()
    await refresh()
    expect(existingEmails.value.has('sam@x.com')).toBe(true)
  })

  it('surfaces a load failure instead of showing an empty roster', async () => {
    loadError = { message: 'nope' }
    const { roster, loadError: err, refresh } = useRoster()
    await refresh()
    expect(err.value).toBe('nope')
    expect(roster.value).toEqual([])
  })

  it('POSTs the raw paste to the roster endpoint', async () => {
    const { addToRoster } = useRoster()
    const result = await addToRoster('a@x.com\nb@x.com')
    expect(calls[0]).toMatchObject({
      url: '/api/invites/roster',
      opts: { method: 'POST', body: { text: 'a@x.com\nb@x.com' } }
    })
    expect(result.added).toBe(1)
  })

  it('re-reads the roster after adding, so the list reflects the new people', async () => {
    const { roster, addToRoster } = useRoster()
    rows = [person('new@x.com', null)]
    await addToRoster('new@x.com')
    expect(roster.value.map(r => r.email)).toEqual(['new@x.com'])
  })
})
