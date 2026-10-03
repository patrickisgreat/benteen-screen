// @vitest-environment nuxt
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('useDebouncedValue', () => {
  it('starts with the current value, with no wait', () => {
    const scope = effectScope()
    scope.run(() => {
      expect(useDebouncedValue(ref('first'), 250).value).toBe('first')
    })
    scope.stop()
  })

  it('catches up only after the source has been quiet for the delay', async () => {
    const scope = effectScope()
    const source = ref('a')
    const debounced = scope.run(() => useDebouncedValue(source, 250))!

    source.value = 'ab'
    await nextTick()
    vi.advanceTimersByTime(200)
    source.value = 'abc' // still typing: the clock restarts
    await nextTick()
    vi.advanceTimersByTime(200)
    expect(debounced.value).toBe('a')

    vi.advanceTimersByTime(50)
    expect(debounced.value).toBe('abc')
    scope.stop()
  })

  it('drops a pending update when its scope is disposed', async () => {
    const scope = effectScope()
    const source = ref('a')
    const debounced = scope.run(() => useDebouncedValue(source, 250))!
    source.value = 'b'
    await nextTick()
    scope.stop()
    vi.advanceTimersByTime(500)
    expect(debounced.value).toBe('a')
  })
})
