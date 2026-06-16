<script setup lang="ts">
// Outdoor movie night → "will it rain?". Within Open-Meteo's ~2-week window we
// show the real event-day forecast; further out (no real data yet) a Farmer's
// Almanac quip; nothing for past events. `tone="light"` for dark backgrounds
// (the overview poster hero); default is muted theme text (the details modal).
const props = defineProps<{ location: string | null, date: string, tone?: 'muted' | 'light' }>()
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

const textClass = computed(() => (props.tone === 'light' ? 'text-white/85' : 'text-muted'))
const strongClass = computed(() => (props.tone === 'light' ? 'text-white' : 'text-default'))
const iconClass = computed(() => (props.tone === 'light' ? 'text-white' : 'text-primary'))
</script>

<template>
  <div
    v-if="forecast?.available"
    class="inline-flex flex-wrap items-center gap-x-2 gap-y-1 text-sm"
    :class="textClass"
  >
    <span class="inline-flex items-center gap-1.5">
      <UIcon :name="describeWeather(forecast.code ?? 0).icon" class="text-base" :class="iconClass" />
      {{ describeWeather(forecast.code ?? 0).label }}
    </span>
    <span class="font-medium" :class="strongClass">{{ forecast.high }}° / {{ forecast.low }}°</span>
    <span v-if="forecast.precipProbability != null" class="inline-flex items-center gap-1">
      <UIcon name="i-lucide-umbrella" /> {{ forecast.precipProbability }}% rain
    </span>
  </div>

  <p
    v-else-if="tooFarOut"
    class="inline-flex items-center gap-1.5 text-sm italic"
    :class="textClass"
  >
    <UIcon name="i-lucide-wheat" class="text-base" />
    The Farmer's Almanac says: {{ almanac }}
  </p>
</template>
