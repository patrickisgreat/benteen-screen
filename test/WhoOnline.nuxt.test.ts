// @vitest-environment nuxt
import { describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import WhoOnline from '../app/components/WhoOnline.vue'

const online = [
  { id: 'me', name: 'Pat', avatar: null },
  { id: 'bob', name: 'Bob', avatar: 'bob.jpg' }
]

describe('WhoOnline', () => {
  it('shows the live count of who is watching', async () => {
    const w = await mountSuspended(WhoOnline, { props: { online } })
    expect(w.text()).toContain('2 watching')
    expect(w.find('button').attributes('aria-label')).toContain('2 watching')
  })

  it('renders nothing when no one is present', async () => {
    const w = await mountSuspended(WhoOnline, { props: { online: [] } })
    expect(w.find('button').exists()).toBe(false)
  })

  it('opens a roster modal listing everyone online', async () => {
    const w = await mountSuspended(WhoOnline, { props: { online } })
    await w.find('button').trigger('click')
    await nextTick()
    // The modal teleports to the document body.
    expect(document.body.textContent).toContain('Who\'s online')
    expect(document.body.textContent).toContain('Pat')
    expect(document.body.textContent).toContain('Bob')
  })
})
