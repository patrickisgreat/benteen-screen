<script setup lang="ts">
import type { Suggestion } from '#shared/types/suggestion'

const props = defineProps<{ suggestion: Suggestion, rank: number, maxVotes: number, locked?: boolean }>()
const emit = defineEmits<{ vote: [], unvote: [], remove: [], trailer: [] }>()

const { myId } = useAuth()

const movie = computed(() => props.suggestion.tmdb_movie)
const year = computed(() => movieYear(movie.value))
const voteCount = computed(() => props.suggestion.votes?.length ?? 0)
const hasVoted = computed(() =>
  Boolean(myId.value) && (props.suggestion.votes ?? []).some(v => v.user_id === myId.value)
)
const isOwner = computed(() =>
  Boolean(myId.value) && props.suggestion.user_id === myId.value
)
const barPct = computed(() => (props.maxVotes > 0 ? Math.round((voteCount.value / props.maxVotes) * 100) : 0))

// Only award medals once there are votes — otherwise the order is just by
// created_at and "rank 1" is meaningless (and ties are arbitrary).
const rankClass = computed(() => {
  if (voteCount.value === 0) return 'bg-elevated text-muted'
  switch (props.rank) {
    case 1: return 'bg-amber-400 text-black'
    case 2: return 'bg-zinc-300 text-black'
    case 3: return 'bg-amber-700 text-white'
    default: return 'bg-elevated text-muted'
  }
})
const highlight = computed(() => props.rank === 1 && voteCount.value > 0)
</script>

<template>
  <UCard variant="subtle" :class="highlight ? 'ring-2 ring-primary/40' : ''" :ui="{ body: 'sm:p-4 p-3' }">
    <div class="flex items-center gap-3">
      <!-- rank -->
      <div class="shrink-0 flex items-center justify-center size-7 rounded-full font-bold text-sm" :class="rankClass">
        {{ rank }}
      </div>

      <!-- poster -->
      <MoviePoster :path="movie.poster_path" :alt="movie.title" size="w185" />

      <!-- content -->
      <div class="min-w-0 flex-1">
        <div class="flex items-start justify-between gap-2">
          <h3 class="font-semibold leading-tight truncate min-w-0 flex-1">
            {{ movie.title }}
            <span v-if="year" class="text-muted font-normal">({{ year }})</span>
          </h3>
          <UBadge
            v-if="locked"
            icon="i-lucide-heart"
            :label="String(voteCount)"
            :color="highlight ? 'primary' : 'neutral'"
            variant="subtle"
            size="md"
            class="shrink-0"
          />
          <UButton
            v-else
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
            v-if="isOwner && !locked"
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
