// @vitest-environment nuxt
import { beforeEach, describe, expect, it } from 'vitest'
import { computed, ref } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import CommsLogDetailModal from '../app/components/CommsLogDetailModal.vue'
import type { CommsLogEntry } from '../app/composables/useCommsLog'
import type { CommsRecipient } from '../app/composables/useCommsRecipients'

// The nuxt test env's DOM mis-parses for DOMPurify (its happy-dom keeps
// <script> where a real browser strips it), so we can't assert the sanitizer's
// output here — sanitize.test.ts covers that in a working DOM. What this
// component owes is that the body reaches v-html only via sanitizeHtml; mock
// it with a marker to prove the route.
mockNuxtImport('sanitizeHtml', () => (html: string | null | undefined) =>
  html ? `[sanitized] ${html.replace(/<[^>]*>/g, '')}` : '')

const recipientsRef = ref<CommsRecipient[]>([])
mockNuxtImport('useCommsRecipients', () => () => ({
  recipients: recipientsRef,
  stats: computed(() => ({
    sent: recipientsRef.value.length,
    delivered: recipientsRef.value.filter(r => r.deliveredAt).length,
    opened: recipientsRef.value.filter(r => r.openedAt).length,
    clicked: recipientsRef.value.filter(r => r.clickedAt).length,
    bounced: recipientsRef.value.filter(r => r.bouncedAt).length
  })),
  error: ref(null),
  refresh: () => Promise.resolve()
}))

const entry = (over: Partial<CommsLogEntry> = {}): CommsLogEntry => ({
  id: 'c1', kind: 'announcement', scope: 'going', subject: 'See you Friday',
  body: '<p>Bring <strong>snacks</strong></p><script>alert(1)</script>',
  recipientCount: 2, failedCount: 0, status: 'sent', error: null,
  sentByName: 'Pat', createdAt: '2026-06-20T18:00:00Z', ...over
})

const recipient = (over: Partial<CommsRecipient> = {}): CommsRecipient => ({
  id: 'r1', email: 'a@x.com', deliveredAt: '2026-07-12T00:01:00Z',
  openedAt: null, clickedAt: null, bouncedAt: null, ...over
})

const bodyText = (): string => document.body.textContent ?? ''

beforeEach(() => {
  document.body.innerHTML = ''
  recipientsRef.value = []
})

describe('CommsLogDetailModal', () => {
  it('renders the message only through sanitizeHtml (Invariant 5)', async () => {
    await mountSuspended(CommsLogDetailModal, { props: { entry: entry(), open: true } })
    await flushPromises()
    // The marker proves the v-html sink received the sanitizer's output, not
    // the raw stored body.
    expect(bodyText()).toContain('[sanitized] Bring snacks')
  })

  it('shows engagement stats and per-recipient status badges', async () => {
    recipientsRef.value = [
      recipient({ openedAt: '2026-07-12T00:02:00Z', clickedAt: '2026-07-12T00:03:00Z' }),
      recipient({ id: 'r2', email: 'b@x.com' })
    ]
    await mountSuspended(CommsLogDetailModal, { props: { entry: entry(), open: true } })
    await flushPromises()
    const text = bodyText()
    expect(text).toContain('Opened')
    expect(text).toContain('Clicked')
    expect(text).toContain('a@x.com')
    expect(text).toContain('b@x.com')
  })

  it('falls back gracefully for sends predating body + recipient recording', async () => {
    await mountSuspended(CommsLogDetailModal, { props: { entry: entry({ body: null, recipientCount: 12 }), open: true } })
    await flushPromises()
    const text = bodyText()
    expect(text).toContain('12 recipients')
    expect(text).toContain('per-recipient tracking isn\'t available')
    expect(text).toContain('The message body wasn\'t recorded')
  })

  it('surfaces the send error when one was recorded', async () => {
    await mountSuspended(CommsLogDetailModal, { props: { entry: entry({ error: 'Unverified sender domain' }), open: true } })
    await flushPromises()
    expect(bodyText()).toContain('Unverified sender domain')
  })
})
