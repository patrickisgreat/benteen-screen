// @vitest-environment nuxt
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import IndexPage from '../app/pages/index.vue'

// hoisted: mockNuxtImport's factory returns navigateTo directly, so it must exist
// before the (hoisted) mock runs. (useAuth's inner fn accesses `user` lazily.)
const navigateTo = vi.hoisted(() => vi.fn())
const user = ref<unknown>(null)
mockNuxtImport('useAuth', () => () => ({ user }))
mockNuxtImport('navigateTo', () => navigateTo)

// UColorModeButton needs useColorMode (not wired in the test runtime) — stub it.
const mountOpts = { global: { stubs: { UColorModeButton: true } } }

beforeEach(() => {
  navigateTo.mockClear()
  user.value = null
})

describe('index (splash) page', () => {
  it('redirects signed-in visitors straight to /overview', async () => {
    user.value = { id: 'u1' }
    await mountSuspended(IndexPage, mountOpts)
    expect(navigateTo).toHaveBeenCalledWith('/overview')
  })

  it('stays on the splash for signed-out visitors', async () => {
    await mountSuspended(IndexPage, mountOpts)
    expect(navigateTo).not.toHaveBeenCalled()
  })
})
