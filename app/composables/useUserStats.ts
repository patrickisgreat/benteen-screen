import type { MaybeRefOrGetter } from "vue";
import type { Database } from "~/types/database.types";
import type { Suggestion } from "#shared/types/suggestion";
import type { UserStats } from "#shared/utils/userStats";

/**
 * Participation stats for one person, for the admin people drill-down: RSVPs,
 * movies they suggested (and which won), votes cast, and what they've brought.
 * A snapshot loaded on demand when a userId is set — no realtime.
 *
 * "Wins" are computed from finished (vote-locked) events only: a suggestion
 * counts as a win when it's a top-2 vote-getter in a locked event, mirroring the
 * double-feature winners shown on the overview.
 */
export function useUserStats(userId: MaybeRefOrGetter<string | null>) {
  const supabase = useSupabaseClient<Database>();
  const stats = ref<UserStats | null>(null);
  const pending = ref(false);
  const error = ref<string | null>(null);

  async function load(id: string): Promise<void> {
    pending.value = true;
    error.value = null;
    try {
      const [rsvps, submissions, votes, brought] = await Promise.all([
        supabase.from("rsvps").select("status").eq("user_id", id),
        supabase
          .from("suggestions")
          .select("id, event_id, tmdb_movie, created_at")
          .eq("user_id", id)
          .eq("deleted", false),
        supabase
          .from("votes")
          .select("suggestion_id", { count: "exact", head: true })
          .eq("user_id", id),
        supabase.from("bring_items").select("label").eq("user_id", id),
      ]);
      const firstError =
        rsvps.error ?? submissions.error ?? votes.error ?? brought.error;
      if (firstError) throw firstError;

      const winningSuggestionIds = await computeWins(
        id,
        submissions.data ?? [],
      );
      // Drop a stale response if the selected user changed mid-flight.
      if (toValue(userId) !== id) return;

      stats.value = computeUserStats({
        rsvps: rsvps.data ?? [],
        submissions: submissions.data ?? [],
        votesCast: votes.count ?? 0,
        brought: brought.data ?? [],
        winningSuggestionIds,
      });
    } catch (e) {
      error.value = errorMessage(e, "Failed to load stats");
      stats.value = null;
    } finally {
      pending.value = false;
    }
  }

  /** For the events this person suggested in, find which of their suggestions won
   *  (top-2 voted) once that event's voting is locked. */
  async function computeWins(
    id: string,
    submissions: ReadonlyArray<{ id: string; event_id: string }>,
  ): Promise<Set<string>> {
    const winners = new Set<string>();
    const eventIds = [...new Set(submissions.map((s) => s.event_id))];
    if (!eventIds.length) return winners;

    const { data: lockedEvents } = await supabase
      .from("events")
      .select("id")
      .in("id", eventIds)
      .not("voting_locked_at", "is", null);
    const lockedIds = (lockedEvents ?? []).map((e) => e.id);
    if (!lockedIds.length) return winners;

    const { data: pool } = await supabase
      .from("suggestions")
      .select(
        "id, event_id, user_id, tmdb_movie, deleted, created_at, votes(user_id)",
      )
      .in("event_id", lockedIds);
    // The votes embed isn't declared in the generated types (no FK relationship
    // row), so PostgREST's inferred shape doesn't match — cast as useSuggestions does.
    const byEvent = new Map<string, Suggestion[]>();
    for (const s of (pool ?? []) as unknown as Suggestion[]) {
      const list = byEvent.get(s.event_id) ?? [];
      list.push(s);
      byEvent.set(s.event_id, list);
    }
    for (const list of byEvent.values()) {
      for (const w of topWinners(list)) winners.add(w.id);
    }
    return winners;
  }

  watch(
    () => toValue(userId),
    (id) => {
      if (!id) {
        stats.value = null;
        return;
      }
      void load(id);
    },
    { immediate: true },
  );

  return { stats, pending, error };
}
