<script setup lang="ts">
import type { MovieEvent } from '#shared/types/event'

// Header for the active event: its poster fills the background, the title rides
// on top. `backdrop` is resolved by the parent (event poster, falling back to the
// current leader's movie poster) so this stays purely presentational.
const props = defineProps<{ event: MovieEvent, backdrop: string | null }>()
defineEmits<{ open: [] }>()

const upcoming = computed(() => isUpcoming(props.event.event_date))
</script>

<template>
  <button
    type="button"
    class="group relative block w-full overflow-hidden rounded-xl text-left ring ring-default min-h-44 sm:min-h-56 transition group-hover:ring-primary/30"
    :aria-label="`${event.title} — view event details`"
    @click="$emit('open')"
  >
    <!-- Poster background (falls back to a neutral surface when none is set) -->
    <div
      v-if="backdrop"
      class="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-105"
      :style="{ backgroundImage: `url(${backdrop})` }"
    />
    <div v-else class="absolute inset-0 bg-elevated" />

    <!-- Legibility gradient so the title is readable over any poster -->
    <div class="absolute inset-0 bg-gradient-to-t from-black/85 via-black/45 to-black/10" />

    <!-- Title block, anchored to the bottom -->
    <div class="absolute inset-x-0 bottom-0 p-5 sm:p-6">
      <div class="flex flex-wrap items-center gap-2 mb-2">
        <UBadge
          :color="upcoming ? 'primary' : 'neutral'"
          :variant="upcoming ? 'solid' : 'subtle'"
          :label="upcoming ? 'Upcoming' : 'Past'"
          icon="i-lucide-calendar"
          size="sm"
        />
        <span class="text-sm text-white/80">{{ formatDate(event.event_date) }}</span>
      </div>
      <h1 class="text-2xl sm:text-3xl font-bold text-white drop-shadow-md text-balance">
        {{ event.title }}
      </h1>
      <p class="mt-1.5 inline-flex items-center gap-1 text-xs text-white/70">
        <UIcon name="i-lucide-info" /> Tap for details
      </p>
    </div>
  </button>
</template>
