<script setup lang="ts">
import type { Profile } from '#shared/types/user'

const open = defineModel<boolean>('open', { default: false })
const props = defineProps<{ person: Profile | null }>()

// Only query while the modal is open for a real person.
const targetId = computed(() => (open.value ? props.person?.id ?? null : null))
const { stats, pending, error } = useUserStats(targetId)

const name = computed(() => props.person?.display_name || props.person?.email || 'Member')
const summary = computed(() => [
  { label: 'Going', value: stats.value?.going ?? 0, icon: 'i-lucide-check' },
  { label: 'Maybe', value: stats.value?.maybe ?? 0, icon: 'i-lucide-help-circle' },
  { label: 'Declined', value: stats.value?.declined ?? 0, icon: 'i-lucide-x' },
  { label: 'Votes cast', value: stats.value?.votesCast ?? 0, icon: 'i-lucide-heart' }
])
</script>

<template>
  <UModal v-model:open="open" :title="name" :description="`${name}'s activity`" :ui="{ content: 'sm:max-w-lg' }">
    <template #body>
      <div v-if="pending" class="py-10 text-center text-muted">
        <UIcon name="i-lucide-loader-circle" class="size-6 animate-spin" />
        <p class="mt-2 text-sm">
          Loading activity…
        </p>
      </div>

      <p v-else-if="error" class="py-6 text-center text-sm text-error">
        {{ error }}
      </p>

      <div v-else-if="stats" class="space-y-5">
        <!-- RSVP + voting summary -->
        <StatTiles :tiles="summary" />

        <!-- Movies suggested -->
        <section>
          <h3 class="text-sm font-semibold mb-2 flex items-center gap-1.5">
            <UIcon name="i-lucide-film" /> Movies suggested
            <UBadge :label="String(stats.submitted.length)" color="neutral" variant="subtle" size="xs" />
            <UBadge v-if="stats.wins" :label="`${stats.wins} won 🏆`" color="primary" variant="subtle" size="xs" />
          </h3>
          <ul v-if="stats.submitted.length" class="space-y-1">
            <li
              v-for="m in stats.submitted"
              :key="m.id"
              class="text-sm flex items-center gap-2 justify-between"
            >
              <span class="truncate">{{ m.title }}</span>
              <UBadge v-if="m.won" label="Winner" icon="i-lucide-trophy" color="primary" variant="subtle" size="xs" class="shrink-0" />
            </li>
          </ul>
          <p v-else class="text-sm text-muted">
            None yet.
          </p>
        </section>

        <!-- Brought to the potluck -->
        <section>
          <h3 class="text-sm font-semibold mb-2 flex items-center gap-1.5">
            <UIcon name="i-lucide-utensils" /> Brought
            <UBadge :label="String(stats.brought.length)" color="neutral" variant="subtle" size="xs" />
          </h3>
          <div v-if="stats.brought.length" class="flex flex-wrap gap-1.5">
            <UBadge v-for="(item, i) in stats.brought" :key="i" :label="item" color="neutral" variant="subtle" />
          </div>
          <p v-else class="text-sm text-muted">
            Nothing yet.
          </p>
        </section>
      </div>
    </template>
  </UModal>
</template>
