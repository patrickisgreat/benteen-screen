// @vitest-environment nuxt
import { describe, expect, it } from 'vitest'

describe('useMyId', () => {
  it('exposes the shared my-id state — the same ref for every caller', () => {
    const id = useMyId()
    id.value = 'user-123'
    // A second call resolves to the same keyed state, not a fresh null ref.
    expect(useMyId().value).toBe('user-123')
  })
})
