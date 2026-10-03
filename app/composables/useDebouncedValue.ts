import type { Ref, WatchSource } from 'vue'

/**
 * A copy of `source` that only catches up once it has stopped changing for
 * `delayMs` — for work that is expensive to redo on every keystroke, like
 * reloading an email preview iframe. Seeded synchronously so the first paint
 * already has a value.
 */
export function useDebouncedValue<T>(source: WatchSource<T>, delayMs: number): Readonly<Ref<T>> {
  const read = (): T => (typeof source === 'function' ? source() : source.value)
  const debounced = shallowRef(read()) as Ref<T>
  let timer: ReturnType<typeof setTimeout> | null = null
  watch(source, (value) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      debounced.value = value
    }, delayMs)
  })
  onScopeDispose(() => {
    if (timer) clearTimeout(timer)
  })
  return debounced
}
