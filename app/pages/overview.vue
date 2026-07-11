<script setup lang="ts">
import type { TmdbMovie } from '#shared/types/movie'
import type { Suggestion } from '#shared/types/suggestion'
import type { RsvpStatus } from '#shared/types/rsvp'

useSeoMeta({ title: 'Overview · BSOTG' })

const toast = useToast()
const { run } = useToastAction()
const { posterUrl } = useTmdb()
const { events } = useEvents()
// Admins can flip between events; everyone else just sees the active one.
const { isAdmin, myId } = useAuth()

const eventIndex = ref(0)
const initialized = ref(false)
const eventInfoOpen = ref(false)
const suggestOpen = ref(false)
const finderOpen = ref(false)
const trailerOpen = ref(false)
const trailerMovie = ref<TmdbMovie | null>(null)

const currentEvent = computed(() => events.value[eventIndex.value] ?? null)
const currentEventId = computed(() => currentEvent.value?.id ?? null)

const { suggestions, refresh: refreshSuggestions, alreadySuggested, suggest, vote, unvote, removeSuggestion, setBlurb } = useSuggestions(currentEventId)
const { myStatus, myPlusOnes, counts, setStatus, setGuests } = useRsvp(currentEventId)
// Who else is looking at this movie night right now (Realtime Presence).
const { online } = usePresence(currentEventId)
// One-time "you got a vote back" nudges when a pick I voted for leaves the ballot.
useVoteRefunds(currentEventId)

const suggestedMovieIds = computed(() => suggestions.value.map(s => s.tmdb_movie.id))
const maxVotes = computed(() => Math.max(1, ...suggestions.value.map(s => s.voteCount ?? 0)))
const totalVotes = computed(() => suggestions.value.reduce((sum, s) => sum + (s.voteCount ?? 0), 0))
// Only surface a "leader" once votes exist — before that the order is just by date.
const leadingTitle = computed(() => (totalVotes.value > 0 ? suggestions.value[0]?.tmdb_movie.title ?? null : null))
const leadPoster = computed(() => (totalVotes.value > 0 ? posterUrl(suggestions.value[0]?.tmdb_movie.poster_path) : null))
// Prefer the event's own poster; fall back to the current leader's movie poster.
const cardBackdrop = computed(() => currentEvent.value?.poster_url || leadPoster.value)

// Voting ended → show the double-feature winners and hide vote/suggest controls.
const votingLocked = computed(() => Boolean(currentEvent.value?.voting_locked_at))
const winners = computed(() => topWinners(suggestions.value))

// You must RSVP "going" to suggest or vote. RLS is the real gate (mirrors
// public.is_going() in the migration); this just drives the UI.
const isGoing = computed(() => myStatus.value === 'going')

// Leaving "going" hides this user's suggestions + soft-deletes their votes (a
// server-side trigger). Confirm first when they actually have something to lose.
const pendingRsvp = ref<RsvpStatus | null>(null)
const confirmLeaveOpen = ref(false)
const leaveSummary = computed(() => {
  const parts: string[] = []
  if (mySuggestionCount.value > 0) parts.push(`${mySuggestionCount.value} suggestion${mySuggestionCount.value === 1 ? '' : 's'}`)
  if (myVoteCount.value > 0) parts.push(`${myVoteCount.value} vote${myVoteCount.value === 1 ? '' : 's'}`)
  return parts.join(' and ')
})
watch(confirmLeaveOpen, (open) => {
  if (!open) pendingRsvp.value = null
})

// Per-event participation caps (mirrors the DB triggers — see shared/utils/limits).
// Effective limit = admin-configured (app_settings) or the default in limits.ts.
const { maxSuggestions: cfgMaxSuggestions, maxVotes: cfgMaxVotes } = useAppSettings()
const suggestionLimit = computed(() => cfgMaxSuggestions.value ?? SUGGESTION_LIMIT)
const voteLimit = computed(() => cfgMaxVotes.value ?? VOTE_LIMIT)
const mySuggestionCount = computed(() => countMySuggestions(suggestions.value, myId.value))
const myVoteCount = computed(() => countMyVotes(suggestions.value, myId.value))
const atSuggestionCap = computed(() => mySuggestionCount.value >= suggestionLimit.value)
const atVoteCap = computed(() => myVoteCount.value >= voteLimit.value)

const eventOptions = computed(() =>
  events.value.map((event, index) => ({
    // Date only — the full (often long) title is shown on the event card below,
    // and a long label here can blow out the row width on mobile.
    label: formatDate(event.event_date, { dateStyle: 'medium' }),
    value: index
  }))
)

watch(events, (list) => {
  if (initialized.value || !list.length) return
  const upcoming = list.findIndex(event => isUpcoming(event.event_date))
  eventIndex.value = upcoming > -1 ? upcoming : list.length - 1
  initialized.value = true
}, { immediate: true })

function previousEvent(): void {
  if (eventIndex.value > 0) eventIndex.value--
}
function nextEvent(): void {
  if (eventIndex.value < events.value.length - 1) eventIndex.value++
}

function openTrailerMovie(movie: TmdbMovie): void {
  trailerMovie.value = movie
  trailerOpen.value = true
}
function openTrailer(suggestion: Suggestion): void {
  openTrailerMovie(suggestion.tmdb_movie)
}

async function onSuggest(movie: TmdbMovie): Promise<void> {
  suggestOpen.value = false
  if (!isGoing.value) {
    toast.add({ title: 'RSVP first', description: 'Mark yourself “Going” to suggest a movie.', color: 'warning' })
    return
  }
  if (alreadySuggested(movie.id)) {
    toast.add({ title: 'Already suggested', description: `${movie.title} is already on the list.`, color: 'warning' })
    return
  }
  if (atSuggestionCap.value) {
    toast.add({ title: `You've used all ${suggestionLimit.value} suggestions`, description: 'Remove one from the list to free up a slot.', color: 'warning' })
    return
  }
  if (await run(() => suggest(movie), 'Could not add suggestion')) {
    toast.add({ title: 'Suggestion added', icon: 'i-lucide-check', color: 'success' })
  }
}
async function onVote(suggestion: Suggestion): Promise<void> {
  if (!isGoing.value) {
    toast.add({ title: 'RSVP first', description: 'Mark yourself “Going” to vote.', color: 'warning' })
    return
  }
  if (atVoteCap.value) {
    toast.add({ title: `You've used all ${voteLimit.value} votes`, description: 'Remove a vote to switch your pick.', color: 'warning' })
    return
  }
  await run(() => vote(suggestion), 'Vote failed')
}
async function onUnvote(suggestion: Suggestion): Promise<void> {
  await run(() => unvote(suggestion), 'Unvote failed')
}
async function onRemove(suggestion: Suggestion): Promise<void> {
  if (await run(() => removeSuggestion(suggestion), 'Could not remove suggestion')) {
    toast.add({ title: 'Suggestion removed', color: 'neutral' })
  }
}
async function onBlurb(suggestion: Suggestion, text: string): Promise<void> {
  if (await run(() => setBlurb(suggestion, text), 'Could not save your take')) {
    toast.add({ title: text ? 'Your take was saved' : 'Your take was removed', icon: 'i-lucide-check', color: 'success' })
  }
}
async function applyRsvp(status: RsvpStatus): Promise<void> {
  if (await run(() => setStatus(status), 'Could not update RSVP')) {
    // The hide/restore happens in a DB trigger; re-pull so the list reflects it now.
    await refreshSuggestions()
  }
}
async function onRsvp(status: RsvpStatus): Promise<void> {
  // Any status tap while "going" leaves "going" (tapping it again clears it).
  if (myStatus.value === 'going' && (mySuggestionCount.value > 0 || myVoteCount.value > 0)) {
    pendingRsvp.value = status
    confirmLeaveOpen.value = true
    return
  }
  await applyRsvp(status)
}
async function confirmLeave(): Promise<void> {
  const status = pendingRsvp.value
  confirmLeaveOpen.value = false
  if (status) await applyRsvp(status)
}
async function onGuests(count: number): Promise<void> {
  await run(() => setGuests(count), 'Could not update guest count')
}
</script>

<template>
  <UContainer class="py-6 sm:py-8">
    <template v-if="events.length && currentEvent">
      <!-- Event selector (admin-only: members just see the active event) -->
      <div v-if="isAdmin" class="flex items-center gap-2 mb-6">
        <UButton
          icon="i-lucide-chevron-left"
          color="neutral"
          variant="outline"
          :disabled="eventIndex === 0"
          aria-label="Previous event"
          @click="previousEvent"
        />
        <USelectMenu
          v-model="eventIndex"
          :items="eventOptions"
          value-key="value"
          :search-input="false"
          class="flex-1 min-w-0"
        />
        <UButton
          icon="i-lucide-chevron-right"
          color="neutral"
          variant="outline"
          :disabled="eventIndex >= events.length - 1"
          aria-label="Next event"
          @click="nextEvent"
        />
      </div>

      <!-- Live "who's watching this movie night" presence -->
      <div class="flex justify-end mb-2 min-h-7">
        <WhoOnline :online="online" />
      </div>

      <!-- Poster-backed header for the active event -->
      <EventHero :event="currentEvent" :backdrop="cardBackdrop" class="mb-6" @open="eventInfoOpen = true" />

      <div class="grid lg:grid-cols-3 gap-6">
        <!-- LEFT: control panel -->
        <aside class="lg:col-span-1 space-y-4 lg:sticky lg:top-20 lg:self-start">
          <!-- RSVP (upcoming only) -->
          <UCard v-if="isUpcoming(currentEvent.event_date)" variant="subtle">
            <h2 class="text-sm font-semibold text-muted mb-2">
              Are you coming?
            </h2>
            <RsvpControl
              :my-status="myStatus"
              :my-plus-ones="myPlusOnes"
              :counts="counts"
              @set="onRsvp"
              @guests="onGuests"
            />
            <p class="text-xs text-muted mt-3 text-center">
              <button type="button" class="text-primary underline inline-flex items-center gap-1" @click="eventInfoOpen = true">
                <UIcon name="i-lucide-list" /> See the bring list
              </button>
            </p>
          </UCard>

          <!-- Stats -->
          <UCard variant="subtle">
            <div class="grid grid-cols-2 gap-3 text-center">
              <div>
                <p class="text-2xl font-bold">
                  {{ suggestions.length }}
                </p>
                <p class="text-xs text-muted">
                  {{ suggestions.length === 1 ? 'movie' : 'movies' }}
                </p>
              </div>
              <div>
                <p class="text-2xl font-bold">
                  {{ totalVotes }}
                </p>
                <p class="text-xs text-muted">
                  {{ totalVotes === 1 ? 'vote' : 'votes' }}
                </p>
              </div>
            </div>
            <template v-if="leadingTitle">
              <USeparator class="my-3" />
              <p class="text-xs text-muted">
                <UIcon name="i-lucide-trophy" class="text-amber-400 align-text-bottom" /> Leading
              </p>
              <p class="font-medium truncate">
                {{ leadingTitle }}
              </p>
            </template>
          </UCard>

          <!-- Suggest + finder (hidden once voting is locked) -->
          <template v-if="!votingLocked">
            <!-- Gate: you must RSVP "going" before you can suggest or vote. -->
            <template v-if="isGoing">
              <p class="text-xs text-muted text-center">
                {{ mySuggestionCount }} of {{ suggestionLimit }} suggestions used
              </p>
              <template v-if="!atSuggestionCap">
                <!-- Suggest (desktop inline) -->
                <div class="hidden lg:block">
                  <h2 class="text-sm font-semibold text-muted mb-2">
                    Suggest a movie
                  </h2>
                  <SuggestSection :suggested-movie-ids="suggestedMovieIds" @suggest="onSuggest" />
                </div>

                <!-- Suggest (mobile) -->
                <UButton
                  class="lg:hidden justify-center"
                  block
                  label="Suggest a movie"
                  icon="i-lucide-plus"
                  @click="suggestOpen = true"
                />

                <!-- Movie finder (all sizes) -->
                <UButton
                  class="justify-center"
                  block
                  color="neutral"
                  variant="outline"
                  label="Help me find a movie"
                  icon="i-lucide-clapperboard"
                  @click="finderOpen = true"
                />
              </template>
              <UAlert
                v-else
                icon="i-lucide-circle-check"
                color="neutral"
                variant="subtle"
                :title="`You've used all ${suggestionLimit} suggestions`"
                description="Remove one from the list to free up a slot."
              />
            </template>
            <!-- Only prompt to RSVP when there's actually an RSVP control to act on
                 (the RsvpControl card is upcoming-only). For a past-but-unlocked event
                 we just hide the suggest controls silently. -->
            <UAlert
              v-else-if="isUpcoming(currentEvent.event_date)"
              icon="i-lucide-calendar-check"
              color="primary"
              variant="subtle"
              title="RSVP to join in"
              description="Mark yourself “Going” to suggest movies and vote on the lineup."
            />
          </template>
          <p v-else class="text-sm text-muted text-center inline-flex items-center justify-center gap-1.5">
            <UIcon name="i-lucide-lock" /> Voting has ended for this movie night.
          </p>
        </aside>

        <!-- RIGHT: rankings -->
        <section class="lg:col-span-2 min-w-0">
          <WinnersBanner v-if="votingLocked && winners.length" :winners="winners" class="mb-4" />

          <div class="flex items-center justify-between mb-4">
            <h2 class="text-xl font-semibold">
              {{ votingLocked ? 'Final results' : 'Rankings' }}
            </h2>
            <UBadge
              v-if="!votingLocked"
              :label="`${myVoteCount}/${voteLimit} votes used`"
              :color="atVoteCap ? 'warning' : 'neutral'"
              variant="subtle"
            />
          </div>

          <!-- TransitionGroup animates the FLIP reorder when votes change the ranking. -->
          <TransitionGroup v-if="suggestions.length" tag="div" name="rank" class="relative space-y-3">
            <SuggestionCard
              v-for="(suggestion, index) in suggestions"
              :key="suggestion.id"
              :suggestion="suggestion"
              :rank="index + 1"
              :max-votes="maxVotes"
              :locked="votingLocked"
              :can-vote="isGoing"
              :vote-cap-reached="atVoteCap"
              @vote="onVote(suggestion)"
              @unvote="onUnvote(suggestion)"
              @remove="onRemove(suggestion)"
              @trailer="openTrailer(suggestion)"
              @blurb="onBlurb(suggestion, $event)"
            />
          </TransitionGroup>
          <UCard v-else variant="subtle" class="text-center py-10">
            <UIcon name="i-lucide-film" class="size-8 text-muted mx-auto" />
            <p class="text-muted mt-2">
              No suggestions yet. Be the first to nominate a movie!
            </p>
          </UCard>
        </section>
      </div>
    </template>

    <!-- No events -->
    <div v-else class="py-20 text-center">
      <UIcon name="i-lucide-calendar-x" class="size-10 text-muted mx-auto" />
      <h1 class="text-xl font-semibold mt-4">
        No movie nights scheduled yet
      </h1>
      <p class="text-muted mt-1">
        Check back soon — an organizer will add the next screening.
      </p>
    </div>

    <!-- Mobile suggest slideover -->
    <USlideover v-model:open="suggestOpen" title="Suggest a movie">
      <template #body>
        <SuggestSection :suggested-movie-ids="suggestedMovieIds" @suggest="onSuggest" />
      </template>
    </USlideover>

    <MovieFinder
      v-model:open="finderOpen"
      :suggested-movie-ids="suggestedMovieIds"
      @suggest="onSuggest"
      @trailer="openTrailerMovie"
    />

    <EventInfoModal v-model:open="eventInfoOpen" :event="currentEvent" />
    <TrailerModal v-model:open="trailerOpen" :movie="trailerMovie" />

    <!-- Warn before leaving "going" hides this user's suggestions + votes. -->
    <UModal v-model:open="confirmLeaveOpen" title="Leave “Going”?">
      <template #body>
        <p class="text-sm text-muted">
          You won't be marked as going, so your <strong class="text-default">{{ leaveSummary }}</strong>
          for this movie night will be hidden. RSVP “Going” again and they'll come right back.
          <span class="block mt-2 text-xs">A top-3 pick (with at least one vote) stays locked in.</span>
        </p>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2 w-full">
          <UButton label="Stay going" color="neutral" variant="ghost" @click="confirmLeaveOpen = false" />
          <UButton label="Hide my stuff" color="warning" icon="i-lucide-eye-off" @click="confirmLeave" />
        </div>
      </template>
    </UModal>
  </UContainer>
</template>

<style scoped>
/* Smoothly slide cards to their new rank when votes reorder the list (FLIP), and
   fade suggestions in/out as they're added/removed. */
.rank-move,
.rank-enter-active,
.rank-leave-active {
  transition: transform 0.45s cubic-bezier(0.22, 0.61, 0.36, 1), opacity 0.35s ease;
}
.rank-enter-from,
.rank-leave-to {
  opacity: 0;
  transform: scale(0.97);
}
/* Take a leaving card out of flow so the others FLIP up into its place. */
.rank-leave-active {
  position: absolute;
  width: 100%;
}

@media (prefers-reduced-motion: reduce) {
  .rank-move,
  .rank-enter-active,
  .rank-leave-active {
    transition: none;
  }
}
</style>
