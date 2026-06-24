<script setup lang="ts">
import type { EventRsvpRoster } from '~/composables/useEventRsvps'

const props = defineProps<{ roster: EventRsvpRoster, showNoReply?: boolean }>()

const sections = computed(() =>
  [
    { key: 'going', label: 'Going', icon: 'i-lucide-check', color: 'text-green-500', people: props.roster.going },
    { key: 'maybe', label: 'Maybe', icon: 'i-lucide-circle-help', color: 'text-amber-500', people: props.roster.maybe },
    { key: 'no', label: 'Can\'t make it', icon: 'i-lucide-x', color: 'text-muted', people: props.roster.no }
  ].filter(s => s.people.length > 0)
)

const hasAnything = computed(() =>
  props.roster.total > 0 || (props.showNoReply === true && props.roster.noReply.length > 0)
)
</script>

<template>
  <div v-if="hasAnything" class="space-y-3">
    <div v-for="s in sections" :key="s.key">
      <p class="text-xs font-semibold text-muted mb-1.5 flex items-center gap-1">
        <UIcon :name="s.icon" :class="s.color" /> {{ s.label }} · {{ s.people.length }}
      </p>
      <ul class="flex flex-wrap gap-1.5">
        <li
          v-for="p in s.people"
          :key="p.key"
          class="inline-flex items-center gap-1.5 rounded-full bg-elevated/60 py-0.5 pl-1 pr-2.5"
        >
          <UAvatar :src="p.avatar ?? undefined" :alt="p.name" size="3xs" />
          <span class="text-sm truncate max-w-40">{{ p.name }}</span>
          <UIcon v-if="p.viaEmail" name="i-lucide-mail" class="size-3 text-dimmed" title="RSVP'd by email" />
        </li>
      </ul>
    </div>

    <div v-if="showNoReply && roster.noReply.length">
      <p class="text-xs font-semibold text-muted mb-1.5 flex items-center gap-1">
        <UIcon name="i-lucide-clock" /> No reply yet · {{ roster.noReply.length }}
      </p>
      <p class="text-sm text-muted">
        {{ roster.noReply.map(p => p.name).join(', ') }}
      </p>
    </div>
  </div>
  <p v-else class="text-sm text-muted">
    No RSVPs yet.
  </p>
</template>
