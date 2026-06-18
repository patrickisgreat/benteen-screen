import type { MaybeRefOrGetter, Ref } from 'vue'

/**
 * Shared lifecycle for an on-demand stats snapshot keyed by an id (an event or a
 * user). Owns the `stats`/`pending`/`error` refs, runs `loader` when the id is
 * set, clears on null, and drops a stale response if the id changed mid-flight.
 * Each caller supplies only its fetch-and-compute `loader`.
 */
export function useOnDemandStats<T>(
  id: MaybeRefOrGetter<string | null>,
  loader: (id: string) => Promise<T>,
  fallbackMessage = 'Failed to load stats'
): { stats: Ref<T | null>, pending: Ref<boolean>, error: Ref<string | null> } {
  const stats = shallowRef<T | null>(null)
  const pending = ref(false)
  const error = ref<string | null>(null)

  async function load(currentId: string): Promise<void> {
    pending.value = true
    error.value = null
    try {
      const result = await loader(currentId)
      // Drop a stale response if the selection changed mid-flight.
      if (toValue(id) !== currentId) return
      stats.value = result
    } catch (e) {
      error.value = errorMessage(e, fallbackMessage)
      stats.value = null
    } finally {
      pending.value = false
    }
  }

  watch(() => toValue(id), (currentId) => {
    if (!currentId) {
      stats.value = null
      return
    }
    void load(currentId)
  }, { immediate: true })

  return { stats, pending, error }
}
