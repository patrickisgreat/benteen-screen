// @vitest-environment nuxt
import { describe, expect, it } from 'vitest'
import { ref } from 'vue'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import SuggestionCard from '../app/components/SuggestionCard.vue'

mockNuxtImport('useAuth', () => () => ({ myId: ref('me') }))
mockNuxtImport('useTmdb', () => () => ({ posterUrl: () => null }))

const suggestion = {
  id: 's1',
  event_id: 'e1',
  user_id: 'me',
  deleted: false,
  created_at: '2026-01-01T00:00:00Z',
  tmdb_movie: { id: 1, title: 'Heat', release_date: '1995-12-15' },
  voteCount: 2,
  votes: [{ user_id: 'me' }, { user_id: 'bob' }]
}

describe('SuggestionCard', () => {
  it('renders rank, title, year and vote count', async () => {
    const w = await mountSuspended(SuggestionCard, { props: { suggestion, rank: 1, maxVotes: 2 } })
    expect(w.text()).toContain('Heat')
    expect(w.text()).toContain('1995')
    expect(w.text()).toContain('2')
  })

  it('emits unvote when the current user has already voted', async () => {
    const w = await mountSuspended(SuggestionCard, { props: { suggestion, rank: 1, maxVotes: 2 } })
    await w.get('[aria-label="Remove vote"]').trigger('click')
    expect(w.emitted('unvote')).toBeTruthy()
    expect(w.emitted('vote')).toBeFalsy()
  })

  it('emits trailer from the Trailer button', async () => {
    const w = await mountSuspended(SuggestionCard, { props: { suggestion, rank: 1, maxVotes: 2 } })
    const trailerBtn = w.findAll('button').find(b => b.text().includes('Trailer'))
    await trailerBtn?.trigger('click')
    expect(w.emitted('trailer')).toBeTruthy()
  })

  it('shows a static vote count and no vote button once locked', async () => {
    const w = await mountSuspended(SuggestionCard, { props: { suggestion, rank: 1, maxVotes: 2, locked: true } })
    expect(w.text()).toContain('2')
    expect(w.find('[aria-label="Remove vote"]').exists()).toBe(false)
    expect(w.find('[aria-label="Vote"]').exists()).toBe(false)
  })

  it('hides the remove button for the owner once locked', async () => {
    const w = await mountSuspended(SuggestionCard, { props: { suggestion, rank: 1, maxVotes: 2, locked: true } })
    expect(w.find('[aria-label="Remove suggestion"]').exists()).toBe(false)
  })

  it('still lets the owner remove while voting is open', async () => {
    const w = await mountSuspended(SuggestionCard, { props: { suggestion, rank: 1, maxVotes: 2 } })
    expect(w.find('[aria-label="Remove suggestion"]').exists()).toBe(true)
  })

  it('disables the vote button at the vote cap when I have not voted', async () => {
    const notMine = { ...suggestion, votes: [{ user_id: 'bob' }] }
    const w = await mountSuspended(SuggestionCard, { props: { suggestion: notMine, rank: 1, maxVotes: 2, voteCapReached: true } })
    expect(w.get('[aria-label="Vote"]').attributes('disabled')).toBeDefined()
  })

  it('still lets me remove a vote at the cap (to switch my pick)', async () => {
    const w = await mountSuspended(SuggestionCard, { props: { suggestion, rank: 1, maxVotes: 2, voteCapReached: true } })
    expect(w.get('[aria-label="Remove vote"]').attributes('disabled')).toBeUndefined()
  })
})
