// @vitest-environment nuxt
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import MovieFinder from '../app/components/MovieFinder.vue'

const discoverGems = vi.fn(async () => [])
mockNuxtImport('useTmdb', () => () => ({ posterUrl: () => null, discoverGems }))
mockNuxtImport('useToast', () => () => ({ add: () => {} }))

beforeEach(() => discoverGems.mockClear())
// The modal teleports its content to <body>; clear it between tests.
afterEach(() => {
  document.body.innerHTML = ''
})

function clickButton(text: string): void {
  const btn = Array.from(document.body.querySelectorAll('button'))
    .find(b => (b.textContent ?? '').trim() === text || (b.textContent ?? '').includes(text))
  btn?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
}

describe('MovieFinder', () => {
  it('loads "feeling lucky" (no genre) when first opened', async () => {
    const w = await mountSuspended(MovieFinder, { props: { open: false, suggestedMovieIds: [] } })
    expect(discoverGems).not.toHaveBeenCalled()
    await w.setProps({ open: true })
    await nextTick()
    expect(discoverGems).toHaveBeenCalledWith(null)
  })

  it('rolls within a genre when its chip is clicked', async () => {
    await mountSuspended(MovieFinder, { props: { open: true, suggestedMovieIds: [] } })
    await nextTick()
    discoverGems.mockClear()
    clickButton('Comedy')
    await nextTick()
    expect(discoverGems).toHaveBeenCalledWith(35)
  })

  it('"I\'m feeling lucky" rolls with no genre after a category was chosen', async () => {
    await mountSuspended(MovieFinder, { props: { open: true, suggestedMovieIds: [] } })
    await nextTick()
    clickButton('Horror')
    await nextTick()
    discoverGems.mockClear()
    clickButton('feeling lucky')
    await nextTick()
    expect(discoverGems).toHaveBeenCalledWith(null)
  })
})
