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

  it('surfaces guests in the headcount line when someone is bringing a +1', async () => {
    const w = await mountSuspended(RsvpControl, { props: { myStatus: 'going', counts: { ...counts, guests: 2 } } })
    expect(w.text()).toContain('+2 guests')
  })

  it('shows the guest stepper only while going, and emits guests on change', async () => {
    const notGoing = await mountSuspended(RsvpControl, { props: { myStatus: 'maybe', counts } })
    expect(notGoing.find('[aria-label="One more guest"]').exists()).toBe(false)

    const going = await mountSuspended(RsvpControl, { props: { myStatus: 'going', myPlusOnes: 0, counts } })
    await going.find('[aria-label="One more guest"]').trigger('click')
    expect(going.emitted('guests')?.[0]).toEqual([1])
  })
})
