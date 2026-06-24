<script setup lang="ts">
import type { MovieEvent } from '#shared/types/event'

// Header for the active event: its poster fills the background, the title rides
// on top. `backdrop` is resolved by the parent (event poster, falling back to the
// current leader's movie poster) so this stays purely presentational.
const props = defineProps<{ event: MovieEvent, backdrop: string | null }>()
defineEmits<{ open: [] }>()

const upcoming = computed(() => isUpcoming(props.event.event_date))
// How this event's poster fills the header (ratio / focal point / zoom).
const display = computed(() => normalizePosterDisplay(props.event.poster_display))
</script>

<template>
  <button
    type="button"
    class="group relative flex flex-col justify-end w-full cursor-pointer overflow-hidden rounded-xl text-left ring ring-default bg-black transition hover:ring-primary/40 min-h-44 sm:min-h-56"
    :style="posterRatioStyle(display.ratio)"
    :aria-label="`${event.title} — view event details`"
    @click="$emit('open')"
  >
    <!-- Blurred fill so a contained poster rests on a soft backdrop, not black bars. -->
    <img v-if="backdrop" :src="backdrop" alt="" class="absolute inset-0 size-full object-cover scale-110 blur-2xl opacity-50">
    <!-- The poster itself: object-contain (whole image visible) with the event's
         focal point + zoom. Hover-scale on the wrapper composes with the zoom. -->
    <div
      v-if="backdrop"
      class="absolute inset-0 transition-transform duration-500 group-hover:scale-105"
    >
      <img :src="backdrop" alt="" class="size-full object-contain" :style="posterFillStyle(display)">
    </div>
    <div v-else class="absolute inset-0 bg-elevated" />

    <!-- Legibility gradient so the title is readable over any poster -->
    <div class="absolute inset-0 bg-gradient-to-t from-black/85 via-black/45 to-black/10" />

    <!-- Title block. In normal flow (justify-end pins it to the bottom) so the
         header grows to fit the text on narrow screens instead of clipping it. -->
    <div class="relative p-5 sm:p-6">
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
      <h1 class="text-2xl sm:text-3xl font-bold text-white drop-shadow-md text-balance underline-offset-4 decoration-2 decoration-white/40 group-hover:underline">
        {{ event.title }}
      </h1>
      <WeatherForecast
        v-if="upcoming && event.location"
        :location="event.location"
        :date="event.event_date"
        tone="light"
        class="mt-2"
      />
      <p class="mt-1.5 inline-flex items-center gap-1 text-xs text-white/70">
        <UIcon name="i-lucide-info" /> Tap for details
      </p>
    </div>
  </button>
</template>
