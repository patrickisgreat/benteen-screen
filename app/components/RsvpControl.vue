<script setup lang="ts">
import type { RsvpStatus } from '#shared/types/rsvp'

const props = defineProps<{
  myStatus: RsvpStatus | null
  myPlusOnes?: number
  counts: { going: number, maybe: number, no: number, guests?: number }
}>()
const emit = defineEmits<{ set: [status: RsvpStatus], guests: [count: number] }>()

const options = [
  { status: 'going' as const, label: 'Going', icon: 'i-lucide-check', color: 'primary' as const },
  { status: 'maybe' as const, label: 'Maybe', icon: 'i-lucide-circle-help', color: 'warning' as const },
  { status: 'no' as const, label: 'Can\'t', icon: 'i-lucide-x', color: 'neutral' as const }
]

const guests = computed(() => props.counts.guests ?? 0)
</script>

<template>
  <div>
    <div class="grid grid-cols-3 gap-2">
      <UButton
        v-for="o in options"
        :key="o.status"
        :label="o.label"
        :icon="o.icon"
        :color="myStatus === o.status ? o.color : 'neutral'"
        :variant="myStatus === o.status ? 'solid' : 'outline'"
        block
        class="justify-center"
        @click="emit('set', o.status)"
      />
    </div>

    <!-- Bringing guests? Only while going. -->
    <div v-if="myStatus === 'going'" class="mt-3 flex items-center justify-between gap-2">
      <span class="text-sm text-muted">Bringing guests?</span>
      <GuestStepper :model-value="myPlusOnes ?? 0" @update:model-value="emit('guests', $event)" />
    </div>

    <p class="text-xs text-muted mt-2 text-center">
      <span class="text-primary font-medium">{{ counts.going }} going</span>
      <span v-if="guests > 0"> (+{{ guests }} guest{{ guests === 1 ? '' : 's' }})</span>
      · {{ counts.maybe }} maybe
    </p>
  </div>
</template>
