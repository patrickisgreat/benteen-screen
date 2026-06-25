// @vitest-environment nuxt
import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import CommsLog from '../app/components/CommsLog.vue'
import type { CommsLogEntry } from '../app/composables/useCommsLog'

const entries: CommsLogEntry[] = [
  { id: 'c1', kind: 'announcement', scope: 'going', subject: 'See you Friday', recipientCount: 12, sentByName: 'Pat', createdAt: '2026-06-20T18:00:00Z' },
  { id: 'c2', kind: 'invite', scope: null, subject: 'E-vite — Movie Night', recipientCount: 30, sentByName: null, createdAt: '2026-06-19T18:00:00Z' }
]

describe('CommsLog', () => {
  it('lists each sent communication with kind, scope, recipients, and sender', async () => {
    const w = await mountSuspended(CommsLog, { props: { entries } })
    expect(w.text()).toContain('See you Friday')
    expect(w.text()).toContain('Announcement')
    expect(w.text()).toContain('going')
    expect(w.text()).toContain('12 recipients')
    expect(w.text()).toContain('by Pat')
    expect(w.text()).toContain('E-vite — Movie Night')
    expect(w.text()).toContain('30 recipients')
  })

  it('singularizes one recipient', async () => {
    const one: CommsLogEntry[] = [{ ...entries[0]!, recipientCount: 1 }]
    const w = await mountSuspended(CommsLog, { props: { entries: one } })
    expect(w.text()).toContain('1 recipient')
    expect(w.text()).not.toContain('1 recipients')
  })

  it('shows an empty state when nothing has been sent', async () => {
    const w = await mountSuspended(CommsLog, { props: { entries: [] } })
    expect(w.text()).toContain('Nothing sent yet')
  })
})
