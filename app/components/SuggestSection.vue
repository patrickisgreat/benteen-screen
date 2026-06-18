<script setup lang="ts">
import type { TmdbMovie } from '#shared/types/movie'

const props = defineProps<{ suggestedMovieIds: number[] }>()
const emit = defineEmits<{ suggest: [movie: TmdbMovie] }>()

const selected = ref<TmdbMovie | null>(null)

const alreadySuggested = computed(() =>
  selected.value ? props.suggestedMovieIds.includes(selected.value.id) : false
)

function confirm(): void {
  if (selected.value && !alreadySuggested.value) {
    emit('suggest', selected.value)
    selected.value = null
  }
}
</script>

<template>
  <div>
    <UCard v-if="selected" variant="subtle">
      <div class="flex gap-3">
        <MoviePoster :path="selected.poster_path" :alt="selected.title" variant="lg" :fallback="false" />
        <div class="min-w-0 flex-1">
          <h3 class="font-semibold leading-tight">
            {{ selected.title }}
            <span v-if="movieYear(selected)" class="text-muted font-normal">({{ movieYear(selected) }})</span>
          </h3>
          <p v-if="selected.vote_average" class="text-sm text-muted mt-1 flex items-center gap-1">
            <UIcon name="i-lucide-star" class="text-amber-400" /> {{ selected.vote_average.toFixed(1) }}
          </p>
          <p v-if="selected.overview" class="text-sm text-muted mt-2 line-clamp-3">
            {{ selected.overview }}
          </p>
          <UAlert
            v-if="alreadySuggested"
            class="mt-2"
            color="warning"
            variant="subtle"
            :ui="{ description: 'text-xs' }"
            description="Already suggested for this event."
          />
          <div class="flex flex-col sm:flex-row gap-2 mt-3">
            <UButton
              label="Suggest this"
              icon="i-lucide-plus"
              class="justify-center"
              :disabled="alreadySuggested"
              @click="confirm"
            />
            <UButton
              label="Cancel"
              color="neutral"
              variant="ghost"
              class="justify-center"
              @click="selected = null"
            />
          </div>
        </div>
      </div>
    </UCard>

    <MovieSearch v-else @select="selected = $event" />
  </div>
</template>
