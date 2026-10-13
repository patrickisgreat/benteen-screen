// @vitest-environment nuxt
import { describe, expect, it } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { defineComponent, h } from 'vue'

const tables: Record<string, Array<{ email: string | null, display_name?: string | null, phone?: string | null }>> = {
  profiles: [{ email: 'ada@x.com', display_name: 'Ada' }],
  invites: [{ email: 'bo@x.com', display_name: 'Bo' }, { email: 'ada@x.com', display_name: 'Ada Roster' }],
  event_invites: [{ email: 'cy@x.com', display_name: null }],
  contacts: [{ email: 'ada@x.com', phone: '+15550000009' }]
}

let failing: string | null = null // a table whose query errors out
const supabase = {
  from: (table: string) => ({
    select: () => Promise.resolve(
      table === failing ? { data: null, error: { message: `${table} unavailable` } } : { data: tables[table] ?? [], error: null }
    )
  })
}
mockNuxtImport('useSupabaseClient', () => () => supabase)

// The directory loads on mount, so exercise it through a host component.
const Host = defineComponent({
  setup() {
    const dir = useGuestDirectory()
    return () => h('div', [
      h('p', dir.error.value ?? ''),
      h('ul', dir.candidates.value.map(c => h('li', `${c.email}|${c.display_name}|${c.source}`)))
    ])
  }
})

// A second host that prints numbers, for the contacts source.
const PhoneHost = defineComponent({
  setup() {
    const dir = useGuestDirectory()
    return () => h('ul', dir.candidates.value.map(c => h('li', `${c.email}|${c.phone ?? ''}`)))
  }
})

describe('useGuestDirectory', () => {
  it('reads each person\'s number from their admin-only contact record', async () => {
    const w = await mountSuspended(PhoneHost)
    await flushPromises()
    expect(w.findAll('li').map(li => li.text())).toContain('ada@x.com|+15550000009')
  })

  it('reports a failed source instead of silently searching a partial directory', async () => {
    failing = 'event_invites'
    try {
      const w = await mountSuspended(Host)
      await flushPromises()
      expect(w.get('p').text()).toBe('event_invites unavailable')
      // The sources that did load are still searchable.
      expect(w.findAll('li').map(li => li.text())).toEqual(['ada@x.com|Ada|member', 'bo@x.com|Bo|roster'])
    } finally {
      failing = null
    }
  })

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
