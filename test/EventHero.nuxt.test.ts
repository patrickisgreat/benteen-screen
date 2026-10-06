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

  it('renders the poster as a contained image (whole image visible)', async () => {
    const w = await mountSuspended(EventHero, { props: { event: baseEvent, backdrop: 'https://img/poster.jpg' } })
    const poster = w.findAll('img').find(i => i.classes().includes('object-contain'))
    expect(poster?.attributes('src')).toBe('https://img/poster.jpg')
  })

  it('applies the event poster_display (ratio, focal point, zoom) to the header', async () => {
    const event = { ...baseEvent, poster_display: { ratio: 'tall', posX: 20, posY: 80, zoom: 1.5 } }
    const w = await mountSuspended(EventHero, { props: { event, backdrop: 'https://img/p.jpg' } })
    expect(w.find('button').attributes('style') ?? '').toContain('aspect-ratio: 4 / 3')
    const poster = w.findAll('img').find(i => i.classes().includes('object-contain'))
    const style = poster?.attributes('style') ?? ''
    expect(style).toContain('object-position: 20% 80%')
    expect(style).toContain('scale(1.5)')
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

  it('signals it is clickable (cursor + link-styled title)', async () => {
    const w = await mountSuspended(EventHero, { props: { event: baseEvent, backdrop: null } })
    expect(w.find('button').classes()).toContain('cursor-pointer')
    expect(w.find('h1').classes()).toContain('group-hover:underline')
  })

  it('surfaces the weather line for an upcoming event with a location', async () => {
    const w = await mountSuspended(EventHero, {
      props: { event: { ...baseEvent, location: 'The Green' }, backdrop: null },
      global: { stubs: { WeatherForecast: { template: '<div class="wf-stub" />' } } }
    })
    expect(w.find('.wf-stub').exists()).toBe(true)
  })

  it('omits the weather line when the event has no location', async () => {
    const w = await mountSuspended(EventHero, {
      props: { event: baseEvent, backdrop: null },
      global: { stubs: { WeatherForecast: { template: '<div class="wf-stub" />' } } }
    })
    expect(w.find('.wf-stub').exists()).toBe(false)
  })

  it('shows the event location when set', async () => {
    const w = await mountSuspended(EventHero, {
      props: { event: { ...baseEvent, location: 'Benteen Field' }, backdrop: null },
      global: { stubs: { WeatherForecast: { template: '<div />' } } }
    })
    expect(w.text()).toContain('Benteen Field')
  })

  it('omits the location line when there is no location', async () => {
    const w = await mountSuspended(EventHero, {
      props: { event: baseEvent, backdrop: null },
      global: { stubs: { WeatherForecast: { template: '<div />' } } }
    })
    expect(w.text()).not.toContain('Benteen Field')
  })

  it('flags an upcoming event that moved to a different day, saying when it was', async () => {
    const moved = { ...baseEvent, previous_event_date: '2999-07-14T19:00:00Z', rescheduled_at: '2999-07-01T00:00:00Z' }
    const w = await mountSuspended(EventHero, { props: { event: moved, backdrop: null } })
    expect(w.text()).toContain('New date · was')
    expect(w.text()).toContain('2999')
  })

  it('shows no "new date" flag for an event that never moved, or only changed time', async () => {
    const never = await mountSuspended(EventHero, { props: { event: baseEvent, backdrop: null } })
    expect(never.text()).not.toContain('New date')
    const sameDay = { ...baseEvent, previous_event_date: baseEvent.event_date, rescheduled_at: '2999-07-01T00:00:00Z' }
    const timeOnly = await mountSuspended(EventHero, { props: { event: sameDay, backdrop: null } })
    expect(timeOnly.text()).not.toContain('New date')
  })

  it('drops the flag once the event has passed', async () => {
    const past = { ...baseEvent, event_date: '2001-07-15T19:00:00Z', previous_event_date: '2001-07-14T19:00:00Z', rescheduled_at: '2001-07-01T00:00:00Z' }
    const w = await mountSuspended(EventHero, { props: { event: past, backdrop: null } })
    expect(w.text()).not.toContain('New date')
  })
})
