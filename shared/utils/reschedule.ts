import { z } from 'zod'

export const RESCHEDULE_NOTE_MAX = 1000
export const RESCHEDULE_TIME_MAX = 40

const bodySchema = z.object({
  eventDate: z.string().datetime({ offset: true }),
  startTime: z.string().trim().max(RESCHEDULE_TIME_MAX).nullish(),
  note: z.string().trim().max(RESCHEDULE_NOTE_MAX).optional(),
  notify: z.boolean().optional()
})

export interface RescheduleRequest {
  /** The new date, as an ISO timestamp. */
  eventDate: string
  /** The new start time ("8pm"), or null for none. */
  startTime: string | null
  /** An optional line from the host explaining the move. */
  note: string | null
  /** Email everyone about it (the default) or move it quietly. */
  notify: boolean
}

export type ParsedReschedule = { ok: true, value: RescheduleRequest } | { ok: false, error: string }

/** Validate a "move the date" request at the boundary; shared by the modal and the route. */
export function parseRescheduleRequest(body: unknown): ParsedReschedule {
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) return { ok: false, error: 'Pick a valid new date' }
  const { eventDate, startTime, note, notify } = parsed.data
  return { ok: true, value: { eventDate, startTime: startTime || null, note: note || null, notify: notify ?? true } }
}

/** Whether a request actually moves the event (a different day, or a different time). */
export function isRescheduled(
  current: { event_date: string, start_time: string | null },
  request: Pick<RescheduleRequest, 'eventDate' | 'startTime'>
): boolean {
  const sameDate = new Date(current.event_date).getTime() === new Date(request.eventDate).getTime()
  return !sameDate || (current.start_time ?? null) !== request.startTime
}

/** Who a date change reaches, by where they stand — what the modal shows before sending. */
export interface RescheduleAudience {
  total: number
  going: number
  maybe: number
  declined: number
  noReply: number
  /** Someone to preview the email as: a name and their current reply. */
  sample: { name: string | null, rsvp: string | null } | null
}
