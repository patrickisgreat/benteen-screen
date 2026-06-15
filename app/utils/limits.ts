/**
 * Per-user, per-event participation limits. The legacy UI showed a hardcoded
 * "3 votes left / 1 suggestion left" that enforced nothing — these are real and
 * enforced both here in the UI and server-side by Postgres triggers (keep these
 * in sync with suggestion_limit()/vote_limit() in the migration SQL).
 */
export const VOTE_LIMIT = 3
export const SUGGESTION_LIMIT = 5
