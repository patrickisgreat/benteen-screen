// @vitest-environment nuxt
import { describe, expect, it } from 'vitest'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import MoviePoster from '../app/components/MoviePoster.vue'

// useTmdb().posterUrl builds the URL from the path; mirror its real behavior so
// the component's poster-vs-fallback branch is exercised faithfully.
mockNuxtImport('useTmdb', () => () => ({
  posterUrl: (path: string | null | undefined, size = 'w500') =>
    path ? `https://image.tmdb.org/t/p/${size}${path}` : null
}))

describe('MoviePoster', () => {
  it('renders the poster image at the requested TMDB size when a path is present', async () => {
    const w = await mountSuspended(MoviePoster, { props: { path: '/abc.jpg', alt: 'Heat', size: 'w185' } })
    const img = w.get('img')
    expect(img.attributes('src')).toBe('https://image.tmdb.org/t/p/w185/abc.jpg')
    expect(img.attributes('alt')).toBe('Heat')
  })

  it('renders the fallback placeholder when there is no poster (default)', async () => {
    const w = await mountSuspended(MoviePoster, { props: { path: null, alt: 'Heat' } })
    expect(w.find('img').exists()).toBe(false)
    expect(w.find('span').exists()).toBe(true)
  })

  it('renders nothing when there is no poster and fallback is disabled', async () => {
    const w = await mountSuspended(MoviePoster, { props: { path: null, alt: 'Heat', fallback: false } })
    expect(w.find('img').exists()).toBe(false)
    expect(w.find('span').exists()).toBe(false)
  })

  it('uses the larger box dimensions for the lg variant', async () => {
    const w = await mountSuspended(MoviePoster, { props: { path: '/x.jpg', alt: 'X', variant: 'lg' } })
    expect(w.get('img').classes()).toContain('h-32')
  })
})
