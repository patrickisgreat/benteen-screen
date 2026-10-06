import { z } from 'zod'

/** A poll needs a real choice, and has to fit in an email as a column of buttons. */
export const POLL_MIN_OPTIONS = 2
export const POLL_MAX_OPTIONS = 6
export const POLL_QUESTION_MAX = 200
export const POLL_OPTION_MAX = 80
export const POLL_NOTE_MAX = 2000

const bodySchema = z.object({
  question: z.string().trim().min(1).max(POLL_QUESTION_MAX),
  options: z.array(z.string().trim().min(1).max(POLL_OPTION_MAX)).min(POLL_MIN_OPTIONS).max(POLL_MAX_OPTIONS),
  note: z.string().trim().max(POLL_NOTE_MAX).optional()
})

export interface PollRequest {
  question: string
  /** The choices, trimmed, in the order the admin wrote them. */
  options: string[]
  /** An optional line of context shown above the buttons. */
  note: string | null
}

export type ParsedPoll = { ok: true, value: PollRequest } | { ok: false, error: string }

/**
 * Validate a new poll at the boundary. Shared by the composer and the route so
 * they never disagree about what a valid poll is: a question, and 2–6 distinct
 * choices (two buttons that read the same would split one answer's votes).
 */
export function parsePollRequest(body: unknown): ParsedPoll {
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) return { ok: false, error: `A poll needs a question and ${POLL_MIN_OPTIONS}–${POLL_MAX_OPTIONS} choices` }
  const { question, options, note } = parsed.data
  const distinct = new Set(options.map(o => o.toLowerCase()))
  if (distinct.size !== options.length) return { ok: false, error: 'Each choice must be different' }
  return { ok: true, value: { question, options, note: note || null } }
}

/** One choice of a poll, with who picked it. */
export interface PollOptionResult {
  id: string
  label: string
  votes: number
  /** Display names of the guests who picked it. */
  voters: string[]
}

/** A poll and its live results, as the admin sees it. */
export interface PollResults {
  id: string
  question: string
  closedAt: string | null
  createdAt: string
  totalVotes: number
  options: PollOptionResult[]
}

/** What the public poll page gets back after a vote: the poll and their answer. */
export interface PollBallot {
  question: string
  options: { id: string, label: string }[]
  /** The option this guest has picked; null if they haven't (e.g. it closed first). */
  chosen: string | null
  closed: boolean
}
