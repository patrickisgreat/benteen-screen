// @vitest-environment nuxt
import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import AdminSuggestionDashboard from '../app/components/AdminSuggestionDashboard.vue'
import type { AdminSuggestion } from '../shared/types/suggestion'

function sug(id: string, authorName: string, authorId: string, voters: Array<[string, string]>, title: string, deleted = false): AdminSuggestion {
  return {
    id,
    event_id: 'e1',
    user_id: authorId,
    tmdb_movie: { id: 1, title },
    deleted,
    created_at: '2026-01-01T00:00:00Z',
    voteCount: voters.length,
    author: { display_name: authorName, email: `${authorId}@x.com` },
    votes: voters.map(([uid, name]) => ({ user_id: uid, voter: { display_name: name } }))
  }
}

const suggestions = [
  sug('s1', 'Ada', 'ada', [['bo', 'Bo'], ['cy', 'Cy']], 'Heat'),
  sug('s2', 'Bo', 'bo', [['ada', 'Ada']], 'Casino')
]
const expected = [{ userId: 'ada', name: 'Ada' }, { userId: 'dee', name: 'Dee' }]

const clickView = async (w: Awaited<ReturnType<typeof mountSuspended>>, label: string): Promise<void> => {
  await w.findAll('button').find(b => b.text().trim() === label)!.trigger('click')
}

describe('AdminSuggestionDashboard', () => {
  it('shows summary stats and the movie list by default', async () => {
    const w = await mountSuspended(AdminSuggestionDashboard, { props: { suggestions, expected } })
    expect(w.text()).toContain('submitters')
    expect(w.text()).toContain('Heat')
    expect(w.text()).toContain('Casino')
    expect(w.text()).toContain('Leading:') // most-voted summary
  })

  it('filters the movie list by the search box', async () => {
    const w = await mountSuspended(AdminSuggestionDashboard, { props: { suggestions, expected } })
    await w.get('input[placeholder*="Search"]').setValue('heat')
    expect(w.text()).toContain('Heat')
    expect(w.text()).not.toContain('Casino')
  })

  it('shows a vote-share bar per movie', async () => {
    const w = await mountSuspended(AdminSuggestionDashboard, { props: { suggestions, expected } })
    // Heat has 2 of max 2 votes → a full-width bar.
    expect(w.html()).toContain('width: 100%')
  })

  it('pivots to a per-person view of suggested + voted', async () => {
    const w = await mountSuspended(AdminSuggestionDashboard, { props: { suggestions, expected } })
    await clickView(w, 'People')
    expect(w.text()).toContain('Suggested')
    expect(w.text()).toContain('Voted for')
    expect(w.text()).toContain('Ada')
    expect(w.text()).toContain('Bo')
  })

  it('lists engagement gaps (RSVPd but inactive)', async () => {
    const w = await mountSuspended(AdminSuggestionDashboard, { props: { suggestions, expected } })
    await clickView(w, 'Gaps')
    // Dee RSVP'd but never suggested or voted.
    expect(w.text()).toContain('Dee')
    expect(w.text()).toContain('No suggestion')
  })

  it('emits toggle when hiding a suggestion', async () => {
    const w = await mountSuspended(AdminSuggestionDashboard, { props: { suggestions, expected } })
    await w.findAll('button').find(b => b.text().includes('Hide'))!.trigger('click')
    expect(w.emitted('toggle')?.[0]).toEqual(['s1', true])
  })
})
