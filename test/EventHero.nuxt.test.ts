// @vitest-environment nuxt
import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import EventHero from '../app/components/EventHero.vue'

const baseEvent = {
  id: 'e1',
  title: 'Dazed and Confused',
  description: '',
  event_date: '2999-07-15T19:00:00Z',
  start_time: null,
  location: null,
  location_url: null,
  poster_url: null,
  created_at: ''
}

describe('EventHero', () => {
  it('shows the active event title', async () => {
    const w = await mountSuspended(EventHero, { props: { event: baseEvent, backdrop: null } })
    expect(w.text()).toContain('Dazed and Confused')
  })

  it('paints the poster as the background when a backdrop is provided', async () => {
    const w = await mountSuspended(EventHero, { props: { event: baseEvent, backdrop: 'https://img/poster.jpg' } })
    const bg = w.find('div').attributes('style') ?? ''
    expect(bg).toContain('background-image')
    expect(bg).toContain('https://img/poster.jpg')
  })

  it('labels an upcoming event as Upcoming', async () => {
    const w = await mountSuspended(EventHero, { props: { event: baseEvent, backdrop: null } })
    expect(w.text()).toContain('Upcoming')
  })

  it('labels a past event as Past', async () => {
    const past = { ...baseEvent, event_date: '2000-01-01T00:00:00Z' }
    const w = await mountSuspended(EventHero, { props: { event: past, backdrop: null } })
    expect(w.text()).toContain('Past')
  })

  it('emits open when clicked', async () => {
    const w = await mountSuspended(EventHero, { props: { event: baseEvent, backdrop: null } })
    await w.find('button').trigger('click')
    expect(w.emitted('open')).toHaveLength(1)
  })
})
