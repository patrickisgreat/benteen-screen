<script setup lang="ts">
import type { Suggestion } from '#shared/types/suggestion'

const props = defineProps<{ suggestion: Suggestion, rank: number, maxVotes: number }>()
const emit = defineEmits<{ vote: [], unvote: [], remove: [], trailer: [] }>()

const { myId } = useAuth()
const { posterUrl } = useTmdb()

const movie = computed(() => props.suggestion.tmdb_movie)
const poster = computed(() => posterUrl(movie.value.poster_path, 'w185'))
const year = computed(() => movie.value.release_date?.slice(0, 4) ?? '')
const voteCount = computed(() => props.suggestion.votes?.length ?? 0)
const hasVoted = computed(() =>
  Boolean(myId.value) && (props.suggestion.votes ?? []).some(v => v.user_id === myId.value)
)
const isOwner = computed(() =>
  Boolean(myId.value) && props.suggestion.user_id === myId.value
)
const barPct = computed(() => (props.maxVotes > 0 ? Math.round((voteCount.value / props.maxVotes) * 100) : 0))

const rankClass = computed(() => {
  switch (props.rank) {
    case 1: return 'bg-amber-400 text-black'
    case 2: return 'bg-zinc-300 text-black'
    case 3: return 'bg-amber-700 text-white'
    default: return 'bg-elevated text-muted'
  }
})
</script>

<template>
  <UCard variant="subtle" :class="rank === 1 ? 'ring-2 ring-primary/40' : ''" :ui="{ body: 'sm:p-4 p-3' }">
    <div class="flex items-center gap-3">
      <!-- rank -->
      <div class="shrink-0 flex items-center justify-center size-7 rounded-full font-bold text-sm" :class="rankClass">
        {{ rank }}
      </div>

      <!-- poster -->
      <img
        v-if="poster"
        :src="poster"
        :alt="movie.title"
        class="h-16 w-11 rounded object-cover bg-elevated shrink-0"
      >
      <div v-else class="h-16 w-11 rounded bg-elevated shrink-0 flex items-center justify-center">
        <UIcon name="i-lucide-film" class="text-muted" />
      </div>

      <!-- content -->
      <div class="min-w-0 flex-1">
        <div class="flex items-start justify-between gap-2">
          <h3 class="font-semibold leading-tight truncate">
            {{ movie.title }}
            <span v-if="year" class="text-muted font-normal">({{ year }})</span>
          </h3>
          <UButton
            :color="hasVoted ? 'error' : 'neutral'"
            :variant="hasVoted ? 'soft' : 'outline'"
            icon="i-lucide-heart"
            :label="String(voteCount)"
            size="sm"
            class="shrink-0"
            :aria-label="hasVoted ? 'Remove vote' : 'Vote'"
            @click="hasVoted ? emit('unvote') : emit('vote')"
          />
        </div>

        <!-- relative vote bar -->
        <div class="mt-2 h-1.5 rounded-full bg-elevated overflow-hidden">
          <div class="h-full rounded-full bg-primary transition-all" :style="{ width: `${barPct}%` }" />
        </div>

        <div class="flex items-center gap-1 mt-2">
          <UButton
            label="Trailer"
            icon="i-lucide-play"
            color="neutral"
            variant="ghost"
            size="xs"
            @click="emit('trailer')"
          />
          <UButton
            v-if="isOwner"
            icon="i-lucide-trash-2"
            color="neutral"
            variant="ghost"
            size="xs"
            aria-label="Remove suggestion"
            @click="emit('remove')"
          />
        </div>
      </div>
    </div>
  </UCard>
</template>
