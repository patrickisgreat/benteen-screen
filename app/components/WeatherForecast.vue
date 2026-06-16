<script setup lang="ts">
// Outdoor movie night → "will it rain?". Within Open-Meteo's ~2-week window we
// show the real event-day forecast; further out (no real data yet) we have a
// little fun with a Farmer's Almanac quip; renders nothing for past events.
const props = defineProps<{ location: string | null, date: string }>()
const { forecast } = useWeather(() => props.location, () => props.date)

const ALMANAC = [
  'weather will be perfect! ☀️',
  'clear skies and a gentle breeze 🌤️',
  'a fine night for a film under the stars ✨',
  'warm, dry, and worth the wait 🌙'
]

const daysAway = computed(() => forecastDaysAway(props.date, new Date()))
// Upcoming but beyond the forecast horizon → no real data yet.
const tooFarOut = computed(() => (daysAway.value ?? -1) > 15)
const almanac = computed(() => ALMANAC[(daysAway.value ?? 0) % ALMANAC.length])
</script>

<template>
  <div
    v-if="forecast?.available"
    class="inline-flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted"
  >
    <span class="inline-flex items-center gap-1.5">
      <UIcon :name="describeWeather(forecast.code ?? 0).icon" class="text-base text-primary" />
      {{ describeWeather(forecast.code ?? 0).label }}
    </span>
    <span class="text-default font-medium">{{ forecast.high }}° / {{ forecast.low }}°</span>
    <span v-if="forecast.precipProbability != null" class="inline-flex items-center gap-1">
      <UIcon name="i-lucide-umbrella" /> {{ forecast.precipProbability }}% rain
    </span>
  </div>

  <p v-else-if="tooFarOut" class="inline-flex items-center gap-1.5 text-sm text-muted italic">
    <UIcon name="i-lucide-wheat" class="text-base" />
    The Farmer's Almanac says: {{ almanac }}
  </p>
</template>
