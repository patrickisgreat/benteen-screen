export type RsvpStatus = 'going' | 'maybe' | 'no'

export interface Rsvp {
  event_id: string
  user_id: string
  status: RsvpStatus
}
