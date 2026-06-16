<script setup lang="ts">
import type { TmdbMovie } from '#shared/types/movie'

const open = defineModel<boolean>('open', { default: false })
const props = defineProps<{ suggestedMovieIds: number[] }>()
const emit = defineEmits<{ suggest: [movie: TmdbMovie], trailer: [movie: TmdbMovie] }>()

const { posterUrl, discoverGems } = useTmdb()
const toast = useToast()

const movies = ref<TmdbMovie[]>([])
const loading = ref(false)

async function load(): Promise<void> {
  loading.value = true
  try {
    movies.value = await discoverGems()
  } catch {
    toast.add({ title: 'Could not load picks — try again', color: 'error' })
  } finally {
    loading.value = false
  }
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
        <div class="flex justify-end">
          <UButton
            label="Shuffle"
            icon="i-lucide-shuffle"
            color="neutral"
            variant="outline"
            size="sm"
            :loading="loading"
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
          No picks right now — hit Shuffle to try again.
        </p>
      </div>
    </template>
  </UModal>
</template>
