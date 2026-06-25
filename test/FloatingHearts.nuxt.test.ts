// @vitest-environment nuxt
import { afterEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import FloatingHearts from '../app/components/FloatingHearts.vue'

// Hearts teleport to <body>, so query the document rather than the wrapper.
interface Spawner { spawn: (kind: 'vote' | 'unvote', x: number, y: number) => void }
const inBody = (): Element[] => Array.from(document.body.querySelectorAll('.floating-heart'))

afterEach(() => {
  document.body.querySelectorAll('.floating-heart').forEach(el => el.remove())
})

describe('FloatingHearts', () => {
  it('starts empty', async () => {
    await mountSuspended(FloatingHearts)
    expect(inBody()).toHaveLength(0)
  })

  it('spawns a red heart for a vote and a grayscale one for an unvote, at the given coords', async () => {
    const w = await mountSuspended(FloatingHearts)
    const vm = w.vm as unknown as Spawner
    vm.spawn('vote', 40, 60)
    await nextTick()
    const first = inBody()[0]!
    expect(first.className).toContain('text-red-500')
    // Positioned at the click's screen coords (fixed overlay).
    expect((first as HTMLElement).style.left).toBe('40px')
    expect((first as HTMLElement).style.top).toBe('60px')

    vm.spawn('unvote', 0, 0)
    await nextTick()
    const all = inBody()
    expect(all).toHaveLength(2)
    expect(all[1]!.className).toContain('grayscale')
  })

  it('removes each heart when its float animation ends', async () => {
    const w = await mountSuspended(FloatingHearts)
    const vm = w.vm as unknown as Spawner
    vm.spawn('vote', 10, 10)
    await nextTick()
    expect(inBody()).toHaveLength(1)

    inBody()[0]!.dispatchEvent(new Event('animationend', { bubbles: true }))
    await nextTick()
    expect(inBody()).toHaveLength(0)
  })
})
