import type { WatchSource } from 'vue'

/**
 * Runs `task` now, then every `intervalMs`, for as long as the calling scope is
 * alive and the browser tab is visible — a hidden tab makes no requests, and
 * catches up the moment it is shown again. Runs never overlap: a tick that
 * lands while the previous run is still in flight is skipped. A failed run is
 * logged and the next tick tries again, so one bad request doesn't stop the
 * polling. Pass `restartOn` to run again immediately when its value changes
 * (e.g. a different event was selected).
 */
export function useVisiblePolling(task: () => Promise<unknown>, intervalMs: number, restartOn?: WatchSource): void {
  let running = false

  async function run(): Promise<void> {
    if (running || document.hidden) return
    running = true
    try {
      await task()
    } catch (e) {
      console.warn('[useVisiblePolling] run failed -', errorMessage(e))
    } finally {
      running = false
    }
  }

  const onVisibilityChange = (): void => void run()

  let timer: ReturnType<typeof setInterval> | null = null
  onMounted(() => {
    void run()
    timer = setInterval(() => void run(), intervalMs)
    document.addEventListener('visibilitychange', onVisibilityChange)
  })
  if (restartOn) watch(restartOn, () => void run())

  onScopeDispose(() => {
    if (timer) clearInterval(timer)
    document.removeEventListener('visibilitychange', onVisibilityChange)
  })
}
