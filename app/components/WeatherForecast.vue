<script setup lang="ts">
// Outdoor movie night → "will it rain?". Shows the event-day forecast when one
// is available (location set + within the forecast window); renders nothing
// otherwise, so it never clutters the UI with a missing-data state.
const props = defineProps<{ location: string | null, date: string }>()
const { forecast } = useWeather(() => props.location, () => props.date)
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
</template>
