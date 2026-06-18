<script setup lang="ts">
import type { TmdbMovie } from '#shared/types/movie'

const emit = defineEmits<{ select: [movie: TmdbMovie] }>()

const { searchMovies } = useTmdb()

const term = ref('')
const results = ref<TmdbMovie[]>([])
const loading = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined

watch(term, (value) => {
  if (timer) clearTimeout(timer)
  const q = value.trim()
  if (!q) {
    results.value = []
    loading.value = false
    return
  }
  loading.value = true
  timer = setTimeout(async () => {
    try {
      results.value = await searchMovies(q)
    } catch {
      results.value = []
    } finally {
      loading.value = false
    }
  }, 300)
})

function choose(movie: TmdbMovie): void {
  emit('select', movie)
  term.value = ''
  results.value = []
}
</script>

<template>
  <div class="space-y-3">
    <UInput
      v-model="term"
      icon="i-lucide-search"
      :loading="loading"
      placeholder="Search for a movie to suggest…"
      class="w-full"
    />

    <ul
      v-if="results.length"
      class="divide-y divide-default rounded-lg ring ring-default overflow-hidden max-h-80 overflow-y-auto"
    >
      <li v-for="movie in results" :key="movie.id">
        <button
          type="button"
          class="flex w-full items-center gap-3 p-3 text-left hover:bg-elevated/50 transition-colors"
          @click="choose(movie)"
        >
          <MoviePoster :path="movie.poster_path" :alt="movie.title" size="w185" />
          <span class="min-w-0">
            <span class="font-medium block truncate">
              {{ movie.title }}<span v-if="movieYear(movie)" class="text-muted font-normal"> ({{ movieYear(movie) }})</span>
            </span>
            <span v-if="movie.vote_average" class="text-sm text-muted flex items-center gap-1">
              <UIcon name="i-lucide-star" class="text-amber-400" /> {{ movie.vote_average.toFixed(1) }}
            </span>
          </span>
        </button>
      </li>
    </ul>

    <p v-else-if="term.trim() && !loading" class="text-sm text-muted">
      No movies found for "{{ term }}".
    </p>
  </div>
</template>
