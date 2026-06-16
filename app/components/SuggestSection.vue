<script setup lang="ts">
import type { TmdbMovie } from '#shared/types/movie'

const props = defineProps<{ suggestedMovieIds: number[] }>()
const emit = defineEmits<{ suggest: [movie: TmdbMovie] }>()

const { posterUrl } = useTmdb()
const selected = ref<TmdbMovie | null>(null)

const alreadySuggested = computed(() =>
  selected.value ? props.suggestedMovieIds.includes(selected.value.id) : false
)
const poster = computed(() => posterUrl(selected.value?.poster_path))

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
        <img
          v-if="poster"
          :src="poster"
          :alt="selected.title"
          class="h-32 w-22 rounded-md object-cover bg-elevated shrink-0"
        >
        <div class="min-w-0 flex-1">
          <h3 class="font-semibold leading-tight">
            {{ selected.title }}
            <span v-if="selected.release_date" class="text-muted font-normal">({{ selected.release_date.slice(0, 4) }})</span>
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
