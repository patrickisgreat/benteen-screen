// @vitest-environment nuxt
import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import CommsLog from '../app/components/CommsLog.vue'
import type { CommsLogEntry } from '../app/composables/useCommsLog'

const entry = (over: Partial<CommsLogEntry> = {}): CommsLogEntry => ({
  id: 'c1', kind: 'announcement', scope: 'going', subject: 'See you Friday',
  recipientCount: 12, failedCount: 0, status: 'sent', error: null,
  sentByName: 'Pat', createdAt: '2026-06-20T18:00:00Z', ...over
})

const entries: CommsLogEntry[] = [
  entry(),
  entry({ id: 'c2', kind: 'invite', scope: null, subject: 'E-vite — Movie Night', recipientCount: 30, sentByName: null, createdAt: '2026-06-19T18:00:00Z' })
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
    const one: CommsLogEntry[] = [entry({ recipientCount: 1 })]
    const w = await mountSuspended(CommsLog, { props: { entries: one } })
    expect(w.text()).toContain('1 recipient')
    expect(w.text()).not.toContain('1 recipients')
  })

  it('labels an automated reminder', async () => {
    const w = await mountSuspended(CommsLog, { props: { entries: [entry({ kind: 'reminder', subject: 'Reminder — Jaws' })] } })
    expect(w.text()).toContain('Reminder')
  })

  it('shows the status for a successful send', async () => {
    const w = await mountSuspended(CommsLog, { props: { entries: [entry()] } })
    expect(w.text()).toContain('Sent')
  })

  it('shows failed count, the Failed status, and the error when a send fails', async () => {
    const failed = entry({ kind: 'reminder', status: 'failed', recipientCount: 0, failedCount: 5, error: 'Unverified sender domain' })
    const w = await mountSuspended(CommsLog, { props: { entries: [failed] } })
    expect(w.text()).toContain('Failed')
    expect(w.text()).toContain('5 failed')
    expect(w.text()).toContain('Unverified sender domain')
  })

  it('flags a partial send', async () => {
    const partial = entry({ kind: 'reminder', status: 'partial', recipientCount: 3, failedCount: 2, error: 'Some bounced' })
    const w = await mountSuspended(CommsLog, { props: { entries: [partial] } })
    expect(w.text()).toContain('Partial')
    expect(w.text()).toContain('2 failed')
  })

  it('shows an empty state when nothing has been sent', async () => {
    const w = await mountSuspended(CommsLog, { props: { entries: [] } })
    expect(w.text()).toContain('Nothing sent yet')
  })
})
