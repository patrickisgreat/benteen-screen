<script setup lang="ts">
import type { TmdbMovie } from '#shared/types/movie'
import type { Suggestion } from '#shared/types/suggestion'
import type { RsvpStatus } from '#shared/types/rsvp'

useSeoMeta({ title: 'Overview · BSOTG' })

const toast = useToast()
const { posterUrl } = useTmdb()
const { events } = useEvents()

const eventIndex = ref(0)
const initialized = ref(false)
const eventInfoOpen = ref(false)
const suggestOpen = ref(false)
const finderOpen = ref(false)
const trailerOpen = ref(false)
const trailerMovie = ref<TmdbMovie | null>(null)

const currentEvent = computed(() => events.value[eventIndex.value] ?? null)
const currentEventId = computed(() => currentEvent.value?.id ?? null)

const { suggestions, alreadySuggested, suggest, vote, unvote, removeSuggestion } = useSuggestions(currentEventId)
const { myStatus, counts, setStatus } = useRsvp(currentEventId)

const suggestedMovieIds = computed(() => suggestions.value.map(s => s.tmdb_movie.id))
const maxVotes = computed(() => Math.max(1, ...suggestions.value.map(s => s.votes?.length ?? 0)))
const totalVotes = computed(() => suggestions.value.reduce((sum, s) => sum + (s.votes?.length ?? 0), 0))
// Only surface a "leader" once votes exist — before that the order is just by date.
const leadingTitle = computed(() => (totalVotes.value > 0 ? suggestions.value[0]?.tmdb_movie.title ?? null : null))
const leadPoster = computed(() => (totalVotes.value > 0 ? posterUrl(suggestions.value[0]?.tmdb_movie.poster_path) : null))
// Prefer the event's own poster; fall back to the current leader's movie poster.
const cardBackdrop = computed(() => currentEvent.value?.poster_url || leadPoster.value)

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
  if (alreadySuggested(movie.id)) {
    toast.add({ title: 'Already suggested', description: `${movie.title} is already on the list.`, color: 'warning' })
    return
  }
  try {
    await suggest(movie)
    toast.add({ title: 'Suggestion added', icon: 'i-lucide-check', color: 'success' })
  } catch {
    toast.add({ title: 'Could not add suggestion', color: 'error' })
  }
}
async function onVote(suggestion: Suggestion): Promise<void> {
  try {
    await vote(suggestion)
  } catch {
    toast.add({ title: 'Vote failed', color: 'error' })
  }
}
async function onUnvote(suggestion: Suggestion): Promise<void> {
  try {
    await unvote(suggestion)
  } catch {
    toast.add({ title: 'Unvote failed', color: 'error' })
  }
}
async function onRemove(suggestion: Suggestion): Promise<void> {
  try {
    await removeSuggestion(suggestion)
    toast.add({ title: 'Suggestion removed', color: 'neutral' })
  } catch {
    toast.add({ title: 'Could not remove suggestion', color: 'error' })
  }
}
async function onRsvp(status: RsvpStatus): Promise<void> {
  try {
    await setStatus(status)
  } catch {
    toast.add({ title: 'Could not update RSVP', color: 'error' })
  }
}
</script>

<template>
  <UContainer class="py-6 sm:py-8">
    <template v-if="events.length && currentEvent">
      <!-- Event selector -->
      <div class="flex items-center gap-2 mb-6">
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

      <div class="grid lg:grid-cols-3 gap-6">
        <!-- LEFT: control panel -->
        <aside class="lg:col-span-1 space-y-4 lg:sticky lg:top-20 lg:self-start">
          <!-- Event header card → details modal -->
          <button type="button" class="w-full text-left group" @click="eventInfoOpen = true">
            <UCard variant="subtle" class="overflow-hidden group-hover:ring-2 group-hover:ring-primary/30 transition" :ui="{ body: 'relative' }">
              <div
                v-if="cardBackdrop"
                class="absolute inset-0 opacity-20 bg-cover bg-center"
                :style="{ backgroundImage: `url(${cardBackdrop})` }"
              />
              <div class="relative">
                <div class="flex flex-wrap items-center gap-2 mb-1">
                  <UBadge
                    :color="isUpcoming(currentEvent.event_date) ? 'primary' : 'neutral'"
                    :variant="isUpcoming(currentEvent.event_date) ? 'solid' : 'subtle'"
                    :label="isUpcoming(currentEvent.event_date) ? 'Upcoming' : 'Past'"
                    icon="i-lucide-calendar"
                    size="sm"
                  />
                  <span class="text-sm text-muted">{{ formatDate(currentEvent.event_date) }}</span>
                </div>
                <h1 class="text-xl font-bold">
                  {{ currentEvent.title }}
                </h1>
                <p class="text-xs text-dimmed mt-1 inline-flex items-center gap-1">
                  <UIcon name="i-lucide-info" /> Tap for details
                </p>
              </div>
            </UCard>
          </button>

          <!-- RSVP (upcoming only) -->
          <UCard v-if="isUpcoming(currentEvent.event_date)" variant="subtle">
            <h2 class="text-sm font-semibold text-muted mb-2">
              Are you coming?
            </h2>
            <RsvpControl :my-status="myStatus" :counts="counts" @set="onRsvp" />
            <p v-if="counts.going" class="text-xs text-muted mt-3 flex items-center gap-1.5 justify-center">
              🍕 {{ counts.going }} pizza dough{{ counts.going === 1 ? '' : 's' }} needed —
              <button type="button" class="text-primary underline" @click="eventInfoOpen = true">
                bring list
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
        </aside>

        <!-- RIGHT: rankings -->
        <section class="lg:col-span-2 min-w-0">
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-xl font-semibold">
              Rankings
            </h2>
            <UBadge :label="`${suggestions.length}`" color="neutral" variant="subtle" />
          </div>

          <div v-if="suggestions.length" class="space-y-3">
            <SuggestionCard
              v-for="(suggestion, index) in suggestions"
              :key="suggestion.id"
              :suggestion="suggestion"
              :rank="index + 1"
              :max-votes="maxVotes"
              @vote="onVote(suggestion)"
              @unvote="onUnvote(suggestion)"
              @remove="onRemove(suggestion)"
              @trailer="openTrailer(suggestion)"
            />
          </div>
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
  </UContainer>
</template>
