<script setup lang="ts">
import type { TmdbMovie } from '#shared/types/movie'

const open = defineModel<boolean>('open', { default: false })
const props = defineProps<{ suggestedMovieIds: number[] }>()
const emit = defineEmits<{ suggest: [movie: TmdbMovie], trailer: [movie: TmdbMovie] }>()

const { posterUrl, discoverGems } = useTmdb()
const toast = useToast()

const movies = ref<TmdbMovie[]>([])
const loading = ref(false)
// null = "I'm feeling lucky" (any genre); otherwise a TMDB genre id.
const genre = ref<number | null>(null)

const activeLabel = computed(() =>
  genre.value === null ? 'feeling lucky' : (MOVIE_GENRES.find(g => g.id === genre.value)?.label ?? '')
)

async function load(): Promise<void> {
  loading.value = true
  try {
    movies.value = await discoverGems(genre.value)
  } catch {
    toast.add({ title: 'Could not load picks — try again', color: 'error' })
  } finally {
    loading.value = false
  }
}

/** Pick a category (or null for lucky) and roll a fresh batch. */
function pick(genreId: number | null): void {
  genre.value = genreId
  load()
}

// Fetch the first batch the first time the modal opens.
watch(open, (isOpen) => {
  if (isOpen && !movies.value.length) load()
})

function isSuggested(movie: TmdbMovie): boolean {
  return props.suggestedMovieIds.includes(movie.id)
}
</script>

<template>
  <UModal
    v-model:open="open"
    title="Help me find a movie"
    description="Critically acclaimed, lesser-known picks. Watch a trailer, then suggest one."
    :ui="{ content: 'sm:max-w-3xl' }"
  >
    <template #body>
      <div class="space-y-4">
        <!-- Category filters: "I'm feeling lucky" (any) + genres -->
        <div class="flex flex-wrap gap-1.5">
          <UButton
            label="I'm feeling lucky"
            icon="i-lucide-dices"
            size="xs"
            :color="genre === null ? 'primary' : 'neutral'"
            :variant="genre === null ? 'solid' : 'outline'"
            @click="pick(null)"
          />
          <UButton
            v-for="g in MOVIE_GENRES"
            :key="g.id"
            :label="g.label"
            size="xs"
            :color="genre === g.id ? 'primary' : 'neutral'"
            :variant="genre === g.id ? 'solid' : 'outline'"
            @click="pick(g.id)"
          />
        </div>

        <div class="flex items-center justify-between gap-2">
          <p class="text-xs text-muted">
            Acclaimed gems · <span class="text-default font-medium">{{ genre === null ? 'any genre' : activeLabel }}</span>
          </p>
          <UButton
            label="Shuffle"
            icon="i-lucide-shuffle"
            color="neutral"
            variant="outline"
            size="sm"
            :loading="loading"
            :aria-label="`Shuffle ${activeLabel}`"
            @click="load"
          />
        </div>

        <div v-if="loading && !movies.length" class="grid sm:grid-cols-2 gap-3">
          <USkeleton v-for="n in 4" :key="n" class="h-32 w-full" />
        </div>

        <div v-else-if="movies.length" class="grid sm:grid-cols-2 gap-3">
          <UCard v-for="movie in movies" :key="movie.id" variant="subtle" :ui="{ body: 'p-3 sm:p-3' }">
            <div class="flex gap-3">
              <img
                v-if="posterUrl(movie.poster_path, 'w185')"
                :src="posterUrl(movie.poster_path, 'w185') ?? undefined"
                :alt="movie.title"
                class="h-32 w-22 rounded-md object-cover bg-elevated shrink-0"
              >
              <div class="min-w-0 flex-1 flex flex-col">
                <h3 class="font-semibold leading-tight text-sm">
                  {{ movie.title }}
                  <span v-if="movie.release_date" class="text-muted font-normal">({{ movie.release_date.slice(0, 4) }})</span>
                </h3>
                <p v-if="movie.vote_average" class="text-xs text-muted mt-0.5 flex items-center gap-1">
                  <UIcon name="i-lucide-star" class="text-amber-400" /> {{ movie.vote_average.toFixed(1) }}
                </p>
                <p v-if="movie.overview" class="text-xs text-muted mt-1 line-clamp-2">
                  {{ movie.overview }}
                </p>
                <div class="flex gap-1.5 mt-auto pt-2">
                  <UButton
                    label="Trailer"
                    icon="i-lucide-play"
                    color="neutral"
                    variant="ghost"
                    size="xs"
                    @click="emit('trailer', movie)"
                  />
                  <UButton
                    :label="isSuggested(movie) ? 'Suggested' : 'Suggest'"
                    icon="i-lucide-plus"
                    size="xs"
                    :disabled="isSuggested(movie)"
                    @click="emit('suggest', movie)"
                  />
                </div>
              </div>
            </div>
          </UCard>
        </div>

        <p v-else class="text-sm text-muted text-center py-8">
          No picks right now — hit Shuffle or try another category.
        </p>
      </div>
    </template>
  </UModal>
</template>
