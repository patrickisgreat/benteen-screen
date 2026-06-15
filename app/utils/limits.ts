/**
 * Per-user, per-event participation limits. The legacy UI showed a hardcoded
 * "3 votes left / 1 suggestion left" that enforced nothing — these are real.
 * Enforced in the UI; vote-count integrity is additionally guarded in
 * firestore.rules (Product Invariant 3).
 */
export const VOTE_LIMIT = 3
export const SUGGESTION_LIMIT = 5
