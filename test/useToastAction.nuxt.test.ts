// @vitest-environment nuxt
import { beforeEach, describe, expect, it } from 'vitest'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'

const added: Array<Record<string, unknown>> = []
mockNuxtImport('useToast', () => () => ({ add: (o: Record<string, unknown>) => added.push(o) }))

beforeEach(() => {
  added.length = 0
})

describe('useToastAction', () => {
  it('runs the action, returns true, and shows no toast on success', async () => {
    const { run } = useToastAction()
    let ran = false
    const ok = await run(async () => {
      ran = true
    }, 'Could not save')
    expect(ran).toBe(true)
    expect(ok).toBe(true)
    expect(added).toHaveLength(0)
  })

  it('returns false and shows an error toast when the action throws', async () => {
    const { run } = useToastAction()
    const failing = async (): Promise<void> => {
      throw new Error('boom')
    }
    const ok = await run(failing, 'Could not save')
    expect(ok).toBe(false)
    expect(added).toEqual([{ title: 'Could not save', color: 'error' }])
  })
})
