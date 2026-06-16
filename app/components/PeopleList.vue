<script setup lang="ts">
import type { Profile } from '#shared/types/user'

const props = defineProps<{ people: Profile[] }>()
const emit = defineEmits<{ block: [person: Profile], unblock: [person: Profile] }>()

const query = ref('')
const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return props.people
  return props.people.filter(p =>
    (p.display_name ?? '').toLowerCase().includes(q) || (p.email ?? '').toLowerCase().includes(q)
  )
})

function initials(p: Profile): string {
  return (p.display_name ?? p.email ?? '?').slice(0, 2).toUpperCase()
}
</script>

<template>
  <div class="space-y-3">
    <UInput v-model="query" icon="i-lucide-search" placeholder="Search members…" class="w-full sm:max-w-xs" />

    <ul v-if="filtered.length" class="divide-y divide-default rounded-lg ring ring-default overflow-hidden">
      <li
        v-for="person in filtered"
        :key="person.id"
        class="flex items-center gap-3 p-3"
        :class="person.blocked ? 'opacity-70' : ''"
      >
        <UAvatar
          :src="person.avatar_url ?? undefined"
          :alt="person.display_name ?? ''"
          :text="initials(person)"
          size="sm"
          class="shrink-0"
        />
        <div class="min-w-0 flex-1">
          <p class="font-medium truncate flex items-center gap-1.5">
            {{ person.display_name ?? 'Unnamed' }}
            <UBadge v-if="person.is_admin" label="Admin" color="primary" variant="subtle" size="xs" />
            <UBadge v-if="person.blocked" label="Blocked" color="error" variant="subtle" size="xs" />
          </p>
          <p class="text-xs text-muted truncate">
            {{ person.email ?? '—' }}
          </p>
        </div>
        <!-- Admins can't be banned from the UI (demote via SQL first). -->
        <UButton
          v-if="person.blocked"
          label="Unban"
          icon="i-lucide-user-check"
          color="neutral"
          variant="outline"
          size="xs"
          class="shrink-0"
          @click="emit('unblock', person)"
        />
        <UButton
          v-else-if="!person.is_admin"
          label="Ban"
          icon="i-lucide-user-x"
          color="error"
          variant="outline"
          size="xs"
          class="shrink-0"
          @click="emit('block', person)"
        />
      </li>
    </ul>
    <p v-else class="text-sm text-muted">
      No members match.
    </p>
  </div>
</template>
