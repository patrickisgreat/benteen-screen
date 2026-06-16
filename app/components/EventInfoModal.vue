<script setup lang="ts">
import type { MovieEvent } from '#shared/types/event'

const open = defineModel<boolean>('open', { default: false })
defineProps<{ event: MovieEvent | null }>()
</script>

<template>
  <UModal v-model:open="open" :title="event?.title || 'Event'">
    <template #body>
      <div v-if="event">
        <div class="flex flex-wrap items-center gap-2 mb-4">
          <UBadge
            :color="isUpcoming(event.event_date) ? 'primary' : 'neutral'"
            :variant="isUpcoming(event.event_date) ? 'solid' : 'subtle'"
            :label="isUpcoming(event.event_date) ? 'Upcoming' : 'Past'"
            icon="i-lucide-calendar"
          />
          <span class="text-muted">{{ formatDate(event.event_date) }}</span>
        </div>
        <div
          v-if="event.description"
          class="text-muted [&_p]:my-2 [&_a]:text-primary [&_a]:underline [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5"
          v-html="sanitizeHtml(event.description)"
        />
        <p v-else class="text-muted">
          No description for this movie night.
        </p>
      </div>
    </template>
  </UModal>
</template>
