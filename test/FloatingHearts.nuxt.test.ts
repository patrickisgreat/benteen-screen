// @vitest-environment nuxt
import { describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import FloatingHearts from '../app/components/FloatingHearts.vue'

interface Spawner { spawn: (kind: 'vote' | 'unvote') => void }

describe('FloatingHearts', () => {
  it('starts empty', async () => {
    const w = await mountSuspended(FloatingHearts)
    expect(w.findAll('.floating-heart')).toHaveLength(0)
  })

  it('spawns a red heart for a vote and a grayscale one for an unvote', async () => {
    const w = await mountSuspended(FloatingHearts)
    const vm = w.vm as unknown as Spawner
    vm.spawn('vote')
    await nextTick()
    expect(w.find('.floating-heart').classes()).toContain('text-red-500')

    vm.spawn('unvote')
    await nextTick()
    const all = w.findAll('.floating-heart')
    expect(all).toHaveLength(2)
    expect(all[1]!.classes()).toContain('grayscale')
  })

  it('removes each heart when its float animation ends', async () => {
    const w = await mountSuspended(FloatingHearts)
    const vm = w.vm as unknown as Spawner
    vm.spawn('vote')
    await nextTick()
    expect(w.findAll('.floating-heart')).toHaveLength(1)

    await w.find('.floating-heart').trigger('animationend')
    await nextTick()
    expect(w.findAll('.floating-heart')).toHaveLength(0)
  })
})
