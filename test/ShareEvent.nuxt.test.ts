// @vitest-environment nuxt
import { describe, expect, it } from 'vitest'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import ShareEvent from '../app/components/ShareEvent.vue'

mockNuxtImport('useToast', () => () => ({ add: () => {} }))

const event = {
  id: 'e1',
  title: 'Jaws',
  description: '',
  event_date: '2999-07-15T19:00:00Z',
  start_time: null,
  location: null,
  location_url: null,
  poster_url: null,
  created_at: ''
}

describe('ShareEvent', () => {
  it('renders social share targets for the event', async () => {
    const w = await mountSuspended(ShareEvent, { props: { event } })
    const html = w.html()
    expect(html).toContain('facebook.com/sharer')
    expect(html).toContain('twitter.com/intent')
    expect(html).toContain('wa.me')
    expect(html).toContain('mailto:')
  })

  it('offers a copy-link action', async () => {
    const w = await mountSuspended(ShareEvent, { props: { event } })
    expect(w.text()).toContain('Copy link')
  })
})
