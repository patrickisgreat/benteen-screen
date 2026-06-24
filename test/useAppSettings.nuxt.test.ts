// @vitest-environment nuxt
import { beforeEach, describe, expect, it } from 'vitest'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'

const updates: unknown[] = []
const supabase = {
  from() {
    return {
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { max_invites: 10, max_suggestions: 7, max_votes: 4 } }) }) }),
      update: (payload: unknown) => {
        updates.push(payload)
        return { eq: () => Promise.resolve({ error: null }) }
      }
    }
  }
}
mockNuxtImport('useSupabaseClient', () => () => supabase)

beforeEach(() => {
  updates.length = 0
})

describe('useAppSettings', () => {
  it('setMaxInvites updates the singleton and reflects the new value', async () => {
    const { setMaxInvites, maxInvites } = useAppSettings()
    await setMaxInvites(50)
    expect(updates[0]).toMatchObject({ max_invites: 50 })
    expect(maxInvites.value).toBe(50)
  })

  it('setMaxInvites can clear the cap (null = unlimited)', async () => {
    const { setMaxInvites, maxInvites } = useAppSettings()
    await setMaxInvites(null)
    expect(updates[0]).toMatchObject({ max_invites: null })
    expect(maxInvites.value).toBeNull()
  })

  it('setMaxSuggestions / setMaxVotes update the participation caps', async () => {
    const s = useAppSettings()
    await s.setMaxSuggestions(7)
    await s.setMaxVotes(4)
    expect(updates).toContainEqual(expect.objectContaining({ max_suggestions: 7 }))
    expect(updates).toContainEqual(expect.objectContaining({ max_votes: 4 }))
    expect(s.maxSuggestions.value).toBe(7)
    expect(s.maxVotes.value).toBe(4)
  })
})
