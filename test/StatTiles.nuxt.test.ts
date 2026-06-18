// @vitest-environment nuxt
import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import StatTiles from '../app/components/StatTiles.vue'

describe('StatTiles', () => {
  it('renders one tile per entry with its value and label', async () => {
    const tiles = [
      { label: 'Movies', value: 3, icon: 'i-lucide-film' },
      { label: 'Votes', value: 7, icon: 'i-lucide-heart' }
    ]
    const w = await mountSuspended(StatTiles, { props: { tiles } })
    expect(w.text()).toContain('Movies')
    expect(w.text()).toContain('3')
    expect(w.text()).toContain('Votes')
    expect(w.text()).toContain('7')
  })
})
