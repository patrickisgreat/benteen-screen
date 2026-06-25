<script setup lang="ts">
import type { CommsLogEntry } from '~/composables/useCommsLog'

defineProps<{ entries: CommsLogEntry[] }>()

const KIND = {
  announcement: { icon: 'i-lucide-megaphone', label: 'Announcement' },
  invite: { icon: 'i-lucide-mail-plus', label: 'E-vite' }
} as const
</script>

<template>
  <div>
    <h3 class="text-sm font-semibold text-muted mb-2">
      Sent communications
    </h3>
    <div v-if="entries.length" class="space-y-2">
      <UCard v-for="e in entries" :key="e.id" variant="subtle" :ui="{ body: 'p-3' }">
        <div class="flex items-start gap-3">
          <UIcon :name="KIND[e.kind].icon" class="size-4 mt-0.5 text-muted shrink-0" />
          <div class="min-w-0 flex-1">
            <p class="text-sm font-medium truncate">
              {{ e.subject || KIND[e.kind].label }}
            </p>
            <p class="text-xs text-muted">
              {{ KIND[e.kind].label }}<span v-if="e.scope"> · {{ e.scope }}</span>
              · {{ e.recipientCount }} recipient{{ e.recipientCount === 1 ? '' : 's' }}
              <span v-if="e.sentByName"> · by {{ e.sentByName }}</span>
            </p>
          </div>
          <time class="text-xs text-muted shrink-0">{{ formatDateTime(e.createdAt) }}</time>
        </div>
      </UCard>
    </div>
    <UCard v-else variant="subtle" class="text-center text-muted text-sm">
      Nothing sent yet for this event.
    </UCard>
  </div>
</template>
