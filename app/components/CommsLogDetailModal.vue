<script setup lang="ts">
import type { CommsLogEntry } from '~/composables/useCommsLog'

// Detail view for one sent communication: the full message that went out plus
// per-recipient engagement (delivered / opened / clicked, live via realtime).
const open = defineModel<boolean>('open', { default: false })
const props = defineProps<{ entry: CommsLogEntry | null }>()

const entryId = computed(() => (open.value ? props.entry?.id ?? null : null))
const { recipients, stats } = useCommsRecipients(entryId)

const STAT_TILES = [
  { key: 'sent', label: 'Sent', icon: 'i-lucide-send' },
  { key: 'delivered', label: 'Delivered', icon: 'i-lucide-mail-check' },
  { key: 'opened', label: 'Opened', icon: 'i-lucide-mail-open' },
  { key: 'clicked', label: 'Clicked', icon: 'i-lucide-mouse-pointer-click' }
] as const

function recipientStatus(r: (typeof recipients)['value'][number]): { label: string, color: 'success' | 'primary' | 'error' | 'neutral' } {
  if (r.bouncedAt) return { label: 'Bounced', color: 'error' }
  if (r.clickedAt) return { label: 'Clicked', color: 'success' }
  if (r.openedAt) return { label: 'Opened', color: 'primary' }
  if (r.deliveredAt) return { label: 'Delivered', color: 'neutral' }
  return { label: 'Sent', color: 'neutral' }
}
</script>

<template>
  <UModal v-model:open="open" :title="entry?.subject || 'Sent communication'" :ui="{ content: 'sm:max-w-xl' }">
    <template #body>
      <div v-if="entry" class="space-y-4">
        <p class="text-xs text-muted">
          <span v-if="entry.scope">{{ entry.scope }} · </span>{{ formatDateTime(entry.createdAt) }}
          <span v-if="entry.sentByName"> · by {{ entry.sentByName }}</span>
        </p>

        <!-- Engagement (webhook-fed, live). Older sends predate per-recipient
             recording, so fall back to the logged totals. -->
        <div v-if="recipients.length" class="grid grid-cols-4 gap-2" data-testid="comms-stats">
          <div v-for="tile in STAT_TILES" :key="tile.key" class="rounded-lg ring ring-default p-2 text-center">
            <UIcon :name="tile.icon" class="size-4 text-muted" />
            <p class="text-lg font-semibold">
              {{ stats[tile.key] }}
            </p>
            <p class="text-xs text-muted">
              {{ tile.label }}
            </p>
          </div>
        </div>
        <p v-else class="text-sm text-muted">
          {{ entry.recipientCount }} recipient{{ entry.recipientCount === 1 ? '' : 's' }}
          <span v-if="entry.failedCount"> · {{ entry.failedCount }} failed</span>
          — per-recipient tracking isn't available for this send.
        </p>
        <p v-if="entry.error" class="text-xs text-error break-words">
          {{ entry.error }}
        </p>

        <!-- The message that went out -->
        <div v-if="entry.body">
          <h3 class="text-sm font-semibold text-muted mb-2">
            Message
          </h3>
          <!-- eslint-disable-next-line vue/no-v-html -- sanitized (Invariant 5) -->
          <div
            class="rounded-lg ring ring-default p-3 text-sm [&_p]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_h1]:font-semibold [&_h2]:font-semibold"
            v-html="sanitizeHtml(entry.body)"
          />
        </div>
        <p v-else class="text-sm text-muted">
          The message body wasn't recorded for this send.
        </p>

        <!-- Who it reached -->
        <div v-if="recipients.length">
          <h3 class="text-sm font-semibold text-muted mb-2">
            Recipients
          </h3>
          <ul class="divide-y divide-default rounded-lg ring ring-default overflow-hidden max-h-64 overflow-y-auto">
            <li v-for="r in recipients" :key="r.id" class="flex items-center justify-between gap-2 p-2">
              <span class="text-sm truncate">{{ r.email }}</span>
              <UBadge :label="recipientStatus(r).label" :color="recipientStatus(r).color" variant="subtle" size="sm" class="shrink-0" />
            </li>
          </ul>
        </div>
      </div>
    </template>
  </UModal>
</template>
