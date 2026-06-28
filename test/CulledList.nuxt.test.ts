// @vitest-environment nuxt
import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import CulledList from '../app/components/CulledList.vue'
import type { CulledSuggestion } from '../app/composables/useCulledSuggestions'

const item = (id: string, title: string, votes: number, culledAt: string): CulledSuggestion => ({
  id,
  event_id: 'e1',
  user_id: 'u',
  tmdb_movie: { id: 1, title },
  deleted: false,
  culled_at: culledAt,
  created_at: '2026-01-01T00:00:00Z',
  voteCount: votes,
  votes: [],
  author: null
})

describe('CulledList', () => {
  it('shows the pruned count and stays collapsed by default', async () => {
    const w = await mountSuspended(CulledList, { props: { items: [item('s1', 'Heat', 2, '2026-06-20T00:00:00Z')] } })
    expect(w.text()).toContain('Pruned (1)')
    expect(w.text()).not.toContain('Heat')
  })

  it('reveals the cut titles and their vote count when expanded', async () => {
    const w = await mountSuspended(CulledList, { props: { items: [item('s1', 'Heat', 2, '2026-06-20T00:00:00Z')] } })
    await w.get('button').trigger('click')
    expect(w.text()).toContain('Heat')
    expect(w.text()).toContain('2 votes')
  })
})
