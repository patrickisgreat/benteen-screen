/**
 * Ballot visibility helpers, mirroring the SQL read paths in the RSVP hide/restore
 * migration so client-side counts match the server. A vote counts toward the ballot
 * only while it isn't soft-deleted (`hidden_at` null — the voter left "going").
 * Suggestions that are admin-deleted or rsvp-hidden are excluded at the query level
 * by each read path, so this only has to handle the per-vote case.
 */
export function liveVoteCount(
  votes: ReadonlyArray<{ hidden_at?: string | null }> | null | undefined
): number {
  return (votes ?? []).filter(v => v.hidden_at == null).length
}
