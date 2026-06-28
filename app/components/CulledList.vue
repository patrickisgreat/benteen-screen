<script setup lang="ts">
import type { CulledSuggestion } from '~/composables/useCulledSuggestions'

// Read-only audit trail of titles pruned from the ballot. Collapsed by default so
// it doesn't clutter the dashboard; culls are permanent, so there are no actions.
defineProps<{ items: ReadonlyArray<CulledSuggestion> }>()
const open = ref(false)
</script>

<template>
  <UCard variant="subtle">
    <button type="button" class="w-full flex items-center justify-between gap-2" @click="open = !open">
      <span class="text-sm font-semibold flex items-center gap-1.5">
        <UIcon name="i-lucide-archive" /> Pruned ({{ items.length }})
      </span>
      <UIcon :name="open ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'" class="text-muted" />
    </button>
    <div v-if="open" class="mt-3 space-y-2">
      <div v-for="s in items" :key="s.id" class="flex items-center justify-between gap-3 text-sm">
        <span class="truncate">{{ s.tmdb_movie.title }}</span>
        <span class="text-xs text-muted shrink-0">
          {{ s.voteCount }} vote{{ s.voteCount === 1 ? '' : 's' }} · cut {{ formatDate(s.culled_at, { dateStyle: 'medium' }) }}
        </span>
      </div>
    </div>
  </UCard>
</template>
