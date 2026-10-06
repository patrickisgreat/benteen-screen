// @vitest-environment nuxt
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, ref, type Ref } from 'vue'
import { mount } from '@vue/test-utils'

let hidden = false
Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden })

function mountPolling(task: () => Promise<unknown>, restartOn?: Ref<unknown>) {
  return mount(defineComponent({
    setup() {
      useVisiblePolling(task, 30_000, restartOn)
      return () => h('div')
    }
  }))
}

beforeEach(() => {
  hidden = false
  vi.useFakeTimers()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => vi.useRealTimers())

describe('useVisiblePolling', () => {
  it('runs straight away, then on every interval', async () => {
    const task = vi.fn(() => Promise.resolve())
    const w = mountPolling(task)
    expect(task).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(30_000)
    expect(task).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(task).toHaveBeenCalledTimes(4)
    w.unmount()
  })

  it('makes no requests while the tab is hidden, and catches up when it is shown again', async () => {
    const task = vi.fn(() => Promise.resolve())
    const w = mountPolling(task)
    await vi.advanceTimersByTimeAsync(0)
    hidden = true
    await vi.advanceTimersByTimeAsync(90_000)
    expect(task).toHaveBeenCalledTimes(1)

    hidden = false
    document.dispatchEvent(new Event('visibilitychange'))
    expect(task).toHaveBeenCalledTimes(2)
    w.unmount()
  })

  it('never overlaps: a tick is skipped while the previous run is still in flight', async () => {
    let finish: () => void = () => {}
    const task = vi.fn(() => new Promise<void>((resolve) => {
      finish = resolve
    }))
    const w = mountPolling(task)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(task).toHaveBeenCalledTimes(1)

    finish()
    await vi.advanceTimersByTimeAsync(30_000)
    expect(task).toHaveBeenCalledTimes(2)
    w.unmount()
  })

  it('keeps polling after a run fails', async () => {
    const task = vi.fn()
      .mockRejectedValueOnce(new Error('resend is down'))
      .mockResolvedValue(undefined)
    const w = mountPolling(task)
    await vi.advanceTimersByTimeAsync(30_000)
    expect(task).toHaveBeenCalledTimes(2)
    w.unmount()
  })

  it('runs again immediately when the watched value changes', async () => {
    const task = vi.fn(() => Promise.resolve())
    const eventId = ref('e1')
    const w = mountPolling(task, eventId)
    await vi.advanceTimersByTimeAsync(0)
    eventId.value = 'e2'
    await nextTick()
    expect(task).toHaveBeenCalledTimes(2)
    w.unmount()
  })

  it('stops when the component goes away', async () => {
    const task = vi.fn(() => Promise.resolve())
    const w = mountPolling(task)
    await vi.advanceTimersByTimeAsync(0)
    w.unmount()
    await vi.advanceTimersByTimeAsync(120_000)
    document.dispatchEvent(new Event('visibilitychange'))
    expect(task).toHaveBeenCalledTimes(1)
  })
})
