// @vitest-environment nuxt
import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import GuestStepper from '../app/components/GuestStepper.vue'

const minus = '[aria-label="One fewer guest"]'
const plus = '[aria-label="One more guest"]'

describe('GuestStepper', () => {
  it('reads "just me" at zero and "+N guests" above', async () => {
    const atZero = await mountSuspended(GuestStepper, { props: { modelValue: 0 } })
    expect(atZero.text()).toContain('just me')
    const atTwo = await mountSuspended(GuestStepper, { props: { modelValue: 2 } })
    expect(atTwo.text()).toContain('+2 guests')
    const atOne = await mountSuspended(GuestStepper, { props: { modelValue: 1 } })
    expect(atOne.text()).toContain('+1 guest')
  })

  it('increments toward the next value', async () => {
    const w = await mountSuspended(GuestStepper, { props: { modelValue: 1 } })
    await w.find(plus).trigger('click')
    expect(w.emitted('update:modelValue')?.[0]).toEqual([2])
  })

  it('decrements toward the previous value', async () => {
    const w = await mountSuspended(GuestStepper, { props: { modelValue: 1 } })
    await w.find(minus).trigger('click')
    expect(w.emitted('update:modelValue')?.[0]).toEqual([0])
  })

  it('disables minus at 0 and plus at the max', async () => {
    const atZero = await mountSuspended(GuestStepper, { props: { modelValue: 0, max: 3 } })
    expect(atZero.find(minus).attributes('disabled')).toBeDefined()
    const atMax = await mountSuspended(GuestStepper, { props: { modelValue: 3, max: 3 } })
    expect(atMax.find(plus).attributes('disabled')).toBeDefined()
  })
})
