// @vitest-environment nuxt
import { afterEach, describe, expect, it } from 'vitest'
import { ref } from 'vue'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import SuggestionCard from '../app/components/SuggestionCard.vue'

// Hearts teleport to <body> and persist across mounts — clear them between tests.
afterEach(() => {
  document.body.querySelectorAll('.floating-heart').forEach(el => el.remove())
})

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

  // The heart overlay teleports to <body>, so assert against the document.
  const bodyHeart = (): HTMLElement | null => document.body.querySelector('.floating-heart')

  it('floats a red heart up when I cast a vote', async () => {
    const notVoted = { ...suggestion, votes: [{ user_id: 'bob' }] }
    const w = await mountSuspended(SuggestionCard, { props: { suggestion: notVoted, rank: 1, maxVotes: 2 } })
    await w.get('[aria-label="Vote"]').trigger('click')
    const heart = bodyHeart()
    expect(heart?.className).toContain('text-red-500')
    expect(w.emitted('vote')).toBeTruthy()
    heart?.remove()
  })

  it('floats a grayscale broken heart up when I remove my vote', async () => {
    const w = await mountSuspended(SuggestionCard, { props: { suggestion, rank: 1, maxVotes: 2 } })
    await w.get('[aria-label="Remove vote"]').trigger('click')
    const heart = bodyHeart()
    expect(heart?.className).toContain('grayscale')
    expect(w.emitted('unvote')).toBeTruthy()
    heart?.remove()
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

  it('disables a new vote when I am not RSVP’d going (canVote=false)', async () => {
    const notMine = { ...suggestion, votes: [{ user_id: 'bob' }] }
    const w = await mountSuspended(SuggestionCard, { props: { suggestion: notMine, rank: 1, maxVotes: 2, canVote: false } })
    const btn = w.get('[aria-label="Vote"]')
    expect(btn.attributes('disabled')).toBeDefined()
    expect(btn.attributes('title')).toContain('RSVP')
  })

  it('still lets me remove an existing vote when not going (canVote=false)', async () => {
    const w = await mountSuspended(SuggestionCard, { props: { suggestion, rank: 1, maxVotes: 2, canVote: false } })
    expect(w.get('[aria-label="Remove vote"]').attributes('disabled')).toBeUndefined()
  })

  it('shows the TMDB synopsis when present', async () => {
    const withOverview = { ...suggestion, tmdb_movie: { ...suggestion.tmdb_movie, overview: 'A crew pulls one last heist.' } }
    const w = await mountSuspended(SuggestionCard, { props: { suggestion: withOverview, rank: 1, maxVotes: 2 } })
    expect(w.text()).toContain('A crew pulls one last heist.')
  })

  it('lets the owner add a take and emits the text on save', async () => {
    const w = await mountSuspended(SuggestionCard, { props: { suggestion, rank: 1, maxVotes: 2 } })
    await w.findAll('button').find(b => b.text().includes('Add your take'))?.trigger('click')
    await w.get('textarea').setValue('Peak Michael Mann.')
    await w.findAll('button').find(b => b.text().trim() === 'Save')?.trigger('click')
    expect(w.emitted('blurb')?.[0]).toEqual(['Peak Michael Mann.'])
  })

  it('shows an existing take and no "add" button for the owner', async () => {
    const withBlurb = { ...suggestion, blurb: 'A desert-island pick for me.' }
    const w = await mountSuspended(SuggestionCard, { props: { suggestion: withBlurb, rank: 1, maxVotes: 2 } })
    expect(w.text()).toContain('A desert-island pick for me.')
    expect(w.findAll('button').find(b => b.text().includes('Add your take'))).toBeUndefined()
  })

  it('does not let a non-owner add a take', async () => {
    const notMine = { ...suggestion, user_id: 'someone-else' }
    const w = await mountSuspended(SuggestionCard, { props: { suggestion: notMine, rank: 1, maxVotes: 2 } })
    expect(w.findAll('button').find(b => b.text().includes('Add your take'))).toBeUndefined()
  })
})
