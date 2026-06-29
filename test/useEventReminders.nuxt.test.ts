// @vitest-environment nuxt
import { beforeEach, describe, expect, it } from 'vitest'
import { ref } from 'vue'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'

interface UpdateCall { table: string, patch: Record<string, unknown>, id: unknown }
const calls: UpdateCall[] = []

const supabase = {
  from(table: string) {
    return {
      update: (patch: Record<string, unknown>) => ({
        eq: (_col: string, id: unknown) => {
          calls.push({ table, patch, id })
          return Promise.resolve({ error: null })
        }
      })
    }
  }
}
mockNuxtImport('useSupabaseClient', () => () => supabase)

beforeEach(() => {
  calls.length = 0
})

describe('useEventReminders', () => {
  it('updates events.reminders_enabled for the given event', async () => {
    const { setEnabled } = useEventReminders(ref('e1'))
    await setEnabled(false)
    expect(calls).toEqual([{ table: 'events', patch: { reminders_enabled: false }, id: 'e1' }])
  })

  it('is a no-op without an event id', async () => {
    const { setEnabled } = useEventReminders(ref(null))
    await setEnabled(true)
    expect(calls).toEqual([])
  })
})
