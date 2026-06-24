// @vitest-environment nuxt
import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import PosterAdjuster from '../app/components/PosterAdjuster.vue'
import type { PosterDisplay } from '../shared/utils/posterDisplay'

const base: PosterDisplay = { ratio: 'banner', posX: 50, posY: 50, zoom: 1 }

function mount() {
  return mountSuspended(PosterAdjuster, { props: { posterUrl: 'https://img/p.jpg', modelValue: { ...base } } })
}

describe('PosterAdjuster', () => {
  it('renders the poster preview image', async () => {
    const w = await mount()
    expect(w.find('img').attributes('src')).toBe('https://img/p.jpg')
  })

  it('emits a ratio change when a preset is clicked', async () => {
    const w = await mount()
    const tall = w.findAll('button').find(b => b.text() === 'Tall')
    await tall!.trigger('click')
    const last = w.emitted('update:modelValue')!.at(-1)![0] as PosterDisplay
    expect(last.ratio).toBe('tall')
  })

  it('emits a zoom change from the range slider', async () => {
    const w = await mount()
    const range = w.find('input[type="range"]')
    ;(range.element as HTMLInputElement).value = '2'
    await range.trigger('input')
    const last = w.emitted('update:modelValue')!.at(-1)![0] as PosterDisplay
    expect(last.zoom).toBe(2)
  })
})
