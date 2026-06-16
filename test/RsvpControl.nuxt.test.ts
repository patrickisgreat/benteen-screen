// @vitest-environment nuxt
import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import RsvpControl from '../app/components/RsvpControl.vue'

const counts = { going: 3, maybe: 1, no: 0 }

describe('RsvpControl', () => {
  it('shows the going and maybe headcount', async () => {
    const w = await mountSuspended(RsvpControl, { props: { myStatus: 'going', counts } })
    expect(w.text()).toContain('3 going')
    expect(w.text()).toContain('1 maybe')
  })

  it('emits set with the chosen status', async () => {
    const w = await mountSuspended(RsvpControl, { props: { myStatus: null, counts } })
    const maybeBtn = w.findAll('button').find(b => b.text().includes('Maybe'))
    await maybeBtn?.trigger('click')
    expect(w.emitted('set')?.[0]).toEqual(['maybe'])
  })
})
