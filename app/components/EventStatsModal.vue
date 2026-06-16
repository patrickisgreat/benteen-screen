<script setup lang="ts">
import type { MovieEvent } from '#shared/types/event'

const open = defineModel<boolean>('open', { default: false })
const props = defineProps<{ event: MovieEvent | null }>()

// Only query while the modal is open for a real event.
const targetId = computed(() => (open.value ? props.event?.id ?? null : null))
const { stats, pending, error } = useEventStats(targetId)

const locked = computed(() => Boolean(props.event?.voting_locked_at))
const title = computed(() => props.event?.title || 'Event')
const tiles = computed(() => [
  { label: 'Movies', value: stats.value?.suggestionCount ?? 0, icon: 'i-lucide-film' },
  { label: 'Votes', value: stats.value?.voteCount ?? 0, icon: 'i-lucide-heart' },
  { label: 'Submitters', value: stats.value?.submitterCount ?? 0, icon: 'i-lucide-user-pen' },
  { label: 'Voters', value: stats.value?.voterCount ?? 0, icon: 'i-lucide-users' }
])
const rsvp = computed(() => [
  { label: 'Going', value: stats.value?.going ?? 0 },
  { label: 'Maybe', value: stats.value?.maybe ?? 0 },
  { label: 'Declined', value: stats.value?.declined ?? 0 }
])
</script>

<template>
  <UModal v-model:open="open" :title="title" description="Event stats" :ui="{ content: 'sm:max-w-lg' }">
    <template #body>
      <div v-if="pending" class="py-10 text-center text-muted">
        <UIcon name="i-lucide-loader-circle" class="size-6 animate-spin" />
        <p class="mt-2 text-sm">
          Loading stats…
        </p>
      </div>

      <p v-else-if="error" class="py-6 text-center text-sm text-error">
        {{ error }}
      </p>

      <div v-else-if="stats" class="space-y-5">
        <!-- Headline counts -->
        <div class="grid grid-cols-4 gap-2 text-center">
          <div v-for="t in tiles" :key="t.label" class="rounded-lg ring ring-default p-2">
            <UIcon :name="t.icon" class="text-muted" />
            <p class="text-xl font-bold leading-tight">
              {{ t.value }}
            </p>
            <p class="text-[11px] text-muted leading-tight">
              {{ t.label }}
            </p>
          </div>
        </div>

        <!-- RSVP split -->
        <section>
          <h3 class="text-sm font-semibold mb-2 flex items-center gap-1.5">
            <UIcon name="i-lucide-calendar-check" /> RSVPs
          </h3>
          <div class="flex gap-2">
            <UBadge v-for="r in rsvp" :key="r.label" :label="`${r.label}: ${r.value}`" color="neutral" variant="subtle" />
          </div>
        </section>

        <!-- Bring list progress -->
        <section>
          <h3 class="text-sm font-semibold mb-2 flex items-center gap-1.5">
            <UIcon name="i-lucide-utensils" /> Bring list
          </h3>
          <p class="text-sm text-muted">
            {{ stats.bringClaimed }} of {{ stats.bringTotal }} item{{ stats.bringTotal === 1 ? '' : 's' }} claimed
          </p>
        </section>

        <!-- Top picks / winners -->
        <section v-if="stats.topPicks.length">
          <h3 class="text-sm font-semibold mb-2 flex items-center gap-1.5">
            <UIcon name="i-lucide-trophy" class="text-amber-400" />
            {{ locked ? 'Winners 🍿' : 'Leading' }}
          </h3>
          <ol class="space-y-1">
            <li
              v-for="(pick, i) in stats.topPicks"
              :key="i"
              class="text-sm flex items-center justify-between gap-2"
            >
              <span class="truncate">{{ i + 1 }}. {{ pick.title }}</span>
              <span class="text-muted shrink-0">{{ pick.votes }} vote{{ pick.votes === 1 ? '' : 's' }}</span>
            </li>
          </ol>
        </section>
      </div>
    </template>
  </UModal>
</template>
