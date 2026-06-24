<script setup lang="ts">
import type { Suggestion } from '#shared/types/suggestion'

// The "double feature" — shown once voting is locked.
defineProps<{ winners: Suggestion[] }>()
const { posterUrl } = useTmdb()
</script>

<template>
  <div v-if="winners.length" class="rounded-xl ring ring-default overflow-hidden">
    <div class="bg-primary/10 px-4 py-2 text-sm font-semibold inline-flex items-center gap-1.5 w-full">
      <UIcon name="i-lucide-trophy" class="text-amber-400" />
      Voting has ended — {{ winners.length > 1 ? 'Double Feature 🍿' : 'Winner 🍿' }}
    </div>
    <div class="p-4 grid gap-4" :class="winners.length > 1 ? 'sm:grid-cols-2' : ''">
      <div v-for="(winner, i) in winners" :key="winner.id" class="flex gap-3 items-center min-w-0">
        <img
          v-if="posterUrl(winner.tmdb_movie.poster_path, 'w185')"
          :src="posterUrl(winner.tmdb_movie.poster_path, 'w185') ?? undefined"
          :alt="`${winner.tmdb_movie.title} poster`"
          class="w-14 rounded ring ring-default shrink-0"
        >
        <div class="min-w-0">
          <p class="text-xs text-muted">
            {{ i === 0 ? '🥇 Top pick' : '🥈 Also showing' }}
          </p>
          <p class="font-bold truncate">
            {{ winner.tmdb_movie.title }}
          </p>
          <p class="text-xs text-muted">
            {{ winner.voteCount ?? 0 }} vote{{ (winner.voteCount ?? 0) === 1 ? '' : 's' }}
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
