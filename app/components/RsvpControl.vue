<script setup lang="ts">
import type { RsvpStatus } from '#shared/types/rsvp'

defineProps<{ myStatus: RsvpStatus | null, counts: { going: number, maybe: number, no: number } }>()
const emit = defineEmits<{ set: [status: RsvpStatus] }>()

const options = [
  { status: 'going' as const, label: 'Going', icon: 'i-lucide-check', color: 'primary' as const },
  { status: 'maybe' as const, label: 'Maybe', icon: 'i-lucide-circle-help', color: 'warning' as const },
  { status: 'no' as const, label: 'Can\'t', icon: 'i-lucide-x', color: 'neutral' as const }
]
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
    <p class="text-xs text-muted mt-2 text-center">
      <span class="text-primary font-medium">{{ counts.going }} going</span>
      · {{ counts.maybe }} maybe
    </p>
  </div>
</template>
