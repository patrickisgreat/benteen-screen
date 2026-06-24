// @vitest-environment nuxt
import { describe, expect, it } from 'vitest'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import WinnersBanner from '../app/components/WinnersBanner.vue'

mockNuxtImport('useTmdb', () => () => ({ posterUrl: (p: string | null) => (p ? `https://img/${p}` : null) }))

const winner = (id: string, title: string, votes: number) => ({
  id,
  event_id: 'e1',
  user_id: 'u1',
  deleted: false,
  created_at: '2026-01-01T00:00:00Z',
  tmdb_movie: { id: 1, title, poster_path: `${id}.jpg` },
  voteCount: votes,
  votes: Array.from({ length: votes }, (_, i) => ({ user_id: `v${i}` }))
})

describe('WinnersBanner', () => {
  it('labels a two-winner result a Double Feature and shows both titles + vote counts', async () => {
    const winners = [winner('a', 'Heat', 5), winner('b', 'Casino', 3)]
    const w = await mountSuspended(WinnersBanner, { props: { winners } })
    expect(w.text()).toContain('Double Feature')
    expect(w.text()).toContain('Heat')
    expect(w.text()).toContain('Casino')
    expect(w.text()).toContain('5 votes')
    expect(w.text()).toContain('3 votes')
  })

  it('labels a single winner as Winner and singularises one vote', async () => {
    const w = await mountSuspended(WinnersBanner, { props: { winners: [winner('a', 'Heat', 1)] } })
    expect(w.text()).toContain('Winner')
    expect(w.text()).not.toContain('Double Feature')
    expect(w.text()).toContain('1 vote')
    expect(w.text()).not.toContain('1 votes')
  })

  it('renders nothing when there are no winners', async () => {
    const w = await mountSuspended(WinnersBanner, { props: { winners: [] } })
    expect(w.text()).toBe('')
  })
})
