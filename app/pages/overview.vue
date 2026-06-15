<script setup lang="ts">
import type { TmdbMovie } from '#shared/types/movie'

definePageMeta({ middleware: 'auth' })
useSeoMeta({ title: 'Overview · BSOTG' })

const toast = useToast()
const { user } = useAuth()
const { events } = useEvents()

const eventIndex = ref(0)
const initialized = ref(false)

const currentEvent = computed(() => events.value[eventIndex.value] ?? null)
const currentEventId = computed(() => currentEvent.value?.id ?? null)

const {
  suggestions,
  alreadySuggested,
  suggest,
  vote,
  unvote,
  removeSuggestion
} = useSuggestions(currentEventId)

const selectedMovie = ref<TmdbMovie | null>(null)

// Real per-user participation limits (replaces the legacy fake counters).
const usedVotes = computed(() => {
  const uid = user.value?.uid
  if (!uid) return 0
  return suggestions.value.filter(s => (s.votes ?? []).some(v => v.userId === uid)).length
})
const usedSuggestions = computed(() => {
  const uid = user.value?.uid
  if (!uid) return 0
  return suggestions.value.filter(s => s.userReference?.id === uid).length
})
const votesLeft = computed(() => Math.max(0, VOTE_LIMIT - usedVotes.value))
const suggestionsLeft = computed(() => Math.max(0, SUGGESTION_LIMIT - usedSuggestions.value))
const voteLocked = computed(() => votesLeft.value <= 0)
const canSuggest = computed(() => suggestionsLeft.value > 0)

const eventOptions = computed(() =>
  events.value.map((event, index) => ({
    label: `${formatDate(event.timestamp, { dateStyle: 'medium' })} · ${event.title}`,
    value: index
  }))
)

// On first data load, jump to the next upcoming event (fallback: the latest one).
watch(events, (list) => {
  if (initialized.value || !list.length) return
  const upcoming = list.findIndex(event => isUpcoming(event.timestamp))
  eventIndex.value = upcoming > -1 ? upcoming : list.length - 1
  initialized.value = true
}, { immediate: true })

function previousEvent(): void {
  if (eventIndex.value > 0) eventIndex.value--
}
function nextEvent(): void {
  if (eventIndex.value < events.value.length - 1) eventIndex.value++
}

async function onSuggest(movie: TmdbMovie): Promise<void> {
  if (!canSuggest.value) {
    toast.add({ title: 'Suggestion limit reached', description: `You can suggest up to ${SUGGESTION_LIMIT} per event.`, color: 'warning' })
    return
  }
  if (alreadySuggested(movie.id)) {
    toast.add({ title: 'Already suggested', description: `${movie.title} is already on the list.`, color: 'warning' })
    selectedMovie.value = null
    return
  }
  try {
    await suggest(movie)
    selectedMovie.value = null
    toast.add({ title: 'Suggestion added', icon: 'i-lucide-check', color: 'success' })
  } catch {
    toast.add({ title: 'Could not add suggestion', color: 'error' })
  }
}

async function onVote(suggestion: typeof suggestions.value[number]): Promise<void> {
  if (voteLocked.value) {
    toast.add({ title: 'Vote limit reached', description: `You can back up to ${VOTE_LIMIT} movies per event. Unvote one to free a slot.`, color: 'warning' })
    return
  }
  try {
    await vote(suggestion)
  } catch {
    toast.add({ title: 'Vote failed', color: 'error' })
  }
}
async function onUnvote(suggestion: typeof suggestions.value[number]): Promise<void> {
  try {
    await unvote(suggestion)
  } catch {
    toast.add({ title: 'Unvote failed', color: 'error' })
  }
}
async function onRemove(suggestion: typeof suggestions.value[number]): Promise<void> {
  try {
    await removeSuggestion(suggestion)
    toast.add({ title: 'Suggestion removed', color: 'neutral' })
  } catch {
    toast.add({ title: 'Could not remove suggestion', color: 'error' })
  }
}
</script>

<template>
  <UContainer class="py-8 max-w-3xl">
    <template v-if="events.length && currentEvent">
      <!-- Event navigation -->
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

      <!-- Event hero -->
      <UCard class="mb-8">
        <div class="flex flex-wrap items-center gap-3 mb-2">
          <UBadge
            :color="isUpcoming(currentEvent.timestamp) ? 'primary' : 'neutral'"
            :variant="isUpcoming(currentEvent.timestamp) ? 'solid' : 'subtle'"
            :label="isUpcoming(currentEvent.timestamp) ? 'Upcoming' : 'Past'"
            icon="i-lucide-calendar"
          />
          <span class="text-muted">{{ formatDate(currentEvent.timestamp) }}</span>
        </div>
        <h1 class="text-2xl font-bold">
          {{ currentEvent.title }}
        </h1>
        <div
          v-if="currentEvent.description"
          class="mt-3 text-muted [&_p]:my-2 [&_a]:text-primary [&_a]:underline [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5"
          v-html="sanitizeHtml(currentEvent.description)"
        />
      </UCard>

      <!-- Suggestions -->
      <div class="flex flex-wrap items-center justify-between gap-2 mb-4">
        <h2 class="text-xl font-semibold">
          Suggestions
        </h2>
        <div class="flex items-center gap-2">
          <UBadge
            :label="`${votesLeft} ${votesLeft === 1 ? 'vote' : 'votes'} left`"
            :color="votesLeft ? 'primary' : 'neutral'"
            variant="subtle"
            icon="i-lucide-heart"
          />
          <UBadge
            :label="`${suggestionsLeft} ${suggestionsLeft === 1 ? 'suggestion' : 'suggestions'} left`"
            :color="suggestionsLeft ? 'primary' : 'neutral'"
            variant="subtle"
            icon="i-lucide-plus"
          />
        </div>
      </div>

      <div v-if="suggestions.length" class="space-y-3">
        <SuggestionCard
          v-for="suggestion in suggestions"
          :key="suggestion.id"
          :suggestion="suggestion"
          :vote-locked="voteLocked"
          @vote="onVote(suggestion)"
          @unvote="onUnvote(suggestion)"
          @remove="onRemove(suggestion)"
        />
      </div>
      <UCard v-else variant="subtle" class="text-center">
        <UIcon name="i-lucide-film" class="size-8 text-muted mx-auto" />
        <p class="text-muted mt-2">
          No suggestions yet. Be the first to nominate a movie!
        </p>
      </UCard>

      <!-- Suggest a movie -->
      <div class="mt-8">
        <h2 class="text-xl font-semibold mb-4">
          Suggest a movie
        </h2>

        <UAlert
          v-if="!canSuggest"
          color="warning"
          variant="subtle"
          icon="i-lucide-info"
          title="Suggestion limit reached"
          :description="`You've used all ${SUGGESTION_LIMIT} of your suggestions for this event.`"
        />

        <UCard v-else-if="selectedMovie" variant="subtle">
          <div class="flex gap-4">
            <img
              v-if="selectedMovie.poster_path"
              :src="`https://image.tmdb.org/t/p/w500${selectedMovie.poster_path}`"
              :alt="selectedMovie.title"
              class="h-40 w-28 rounded-md object-cover bg-elevated shrink-0"
            >
            <div class="min-w-0 flex-1">
              <h3 class="font-semibold text-lg">
                {{ selectedMovie.title }}
                <span v-if="selectedMovie.release_date" class="text-muted font-normal">
                  ({{ selectedMovie.release_date.slice(0, 4) }})
                </span>
              </h3>
              <p v-if="selectedMovie.vote_average" class="text-sm text-muted mt-1 flex items-center gap-1">
                <UIcon name="i-lucide-star" class="text-amber-400" />
                {{ selectedMovie.vote_average.toFixed(1) }}
              </p>
              <p v-if="selectedMovie.overview" class="text-sm text-muted mt-2 line-clamp-4">
                {{ selectedMovie.overview }}
              </p>
              <div class="flex gap-2 mt-4">
                <UButton
                  label="Suggest this"
                  icon="i-lucide-plus"
                  :disabled="alreadySuggested(selectedMovie.id)"
                  @click="onSuggest(selectedMovie)"
                />
                <UButton
                  label="Cancel"
                  color="neutral"
                  variant="ghost"
                  @click="selectedMovie = null"
                />
              </div>
            </div>
          </div>
        </UCard>

        <MovieSearch v-else @select="selectedMovie = $event" />
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
  </UContainer>
</template>
