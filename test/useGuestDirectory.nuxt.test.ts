// @vitest-environment nuxt
import { describe, expect, it } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { defineComponent, h } from 'vue'

const tables: Record<string, Array<{ email: string | null, display_name: string | null }>> = {
  profiles: [{ email: 'ada@x.com', display_name: 'Ada' }],
  invites: [{ email: 'bo@x.com', display_name: 'Bo' }, { email: 'ada@x.com', display_name: 'Ada Roster' }],
  event_invites: [{ email: 'cy@x.com', display_name: null }]
}

const supabase = {
  from: (table: string) => ({ select: () => Promise.resolve({ data: tables[table] ?? [] }) })
}
mockNuxtImport('useSupabaseClient', () => () => supabase)

// The directory loads on mount, so exercise it through a host component.
const Host = defineComponent({
  setup() {
    const dir = useGuestDirectory()
    return () => h('ul', dir.candidates.value.map(c => h('li', `${c.email}|${c.display_name}|${c.source}`)))
  }
})

describe('useGuestDirectory', () => {
  it('merges members, roster and past guests into one deduped directory', async () => {
    const w = await mountSuspended(Host)
    await flushPromises()
    const rows = w.findAll('li').map(li => li.text())
    expect(rows).toEqual([
      'ada@x.com|Ada|member',
      'bo@x.com|Bo|roster',
      'cy@x.com|null|past-guest'
    ])
  })
})
