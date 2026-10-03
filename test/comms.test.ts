import { describe, expect, it } from 'vitest'
import { commsStatus, tallyDelivery, type TrackedMessage } from '../shared/utils/comms'

describe('commsStatus', () => {
  it('is "sent" when everything went out', () => {
    expect(commsStatus(5, 0)).toBe('sent')
  })

  it('is "partial" when some went out and some failed', () => {
    expect(commsStatus(3, 2)).toBe('partial')
  })

  it('is "failed" when nothing went out', () => {
    expect(commsStatus(0, 4)).toBe('failed')
  })

  it('treats a no-op (nothing attempted) as sent, not failed', () => {
    expect(commsStatus(0, 0)).toBe('sent')
  })
})

describe('tallyDelivery', () => {
  const message = (over: Partial<TrackedMessage>): TrackedMessage => ({
    comms_log_id: 'send-1', delivered_at: null, opened_at: null, clicked_at: null, bounced_at: null, ...over
  })

  it('counts delivered, opened, clicked and bounced per send', () => {
    const stats = tallyDelivery([
      message({ delivered_at: 't', opened_at: 't', clicked_at: 't' }),
      message({ delivered_at: 't', opened_at: 't' }),
      message({ delivered_at: 't' }),
      message({ bounced_at: 't' }),
      message({})
    ])
    expect(stats.get('send-1')).toEqual({ tracked: 5, delivered: 3, opened: 2, clicked: 1, bounced: 1 })
  })

  it('keeps each send separate', () => {
    const stats = tallyDelivery([
      message({ comms_log_id: 'a', opened_at: 't' }),
      message({ comms_log_id: 'b' })
    ])
    expect(stats.get('a')?.opened).toBe(1)
    expect(stats.get('b')).toEqual({ tracked: 1, delivered: 0, opened: 0, clicked: 0, bounced: 0 })
  })

  it('leaves out messages that belong to no send', () => {
    expect(tallyDelivery([message({ comms_log_id: null, opened_at: 't' })]).size).toBe(0)
  })
})
