<script setup lang="ts">
import type { Profile } from '#shared/types/user'
import type { Invite } from '#shared/types/invite'

const props = withDefaults(
  defineProps<{ people: Profile[], pending?: Invite[] }>(),
  { pending: () => [] }
)
const emit = defineEmits<{
  block: [person: Profile]
  unblock: [person: Profile]
  revoke: [invite: Invite]
}>()

type Row
  = | { kind: 'member', key: string, name: string, email: string, profile: Profile }
    | { kind: 'pending', key: string, name: string, email: string, invite: Invite }

const query = ref('')

// Pending invites whose email already belongs to a member are redundant — drop them.
const memberEmails = computed(
  () => new Set(props.people.map(p => (p.email ?? '').toLowerCase()).filter(Boolean))
)

const rows = computed<Row[]>(() => {
  const members: Row[] = props.people.map(p => ({
    kind: 'member',
    key: p.id,
    name: p.display_name ?? 'Unnamed',
    email: p.email ?? '',
    profile: p
  }))
  const invites: Row[] = props.pending
    .filter(i => !memberEmails.value.has(i.email.toLowerCase()))
    .map(i => ({
      kind: 'pending',
      key: `invite:${i.email}`,
      name: i.display_name ?? i.email,
      email: i.email,
      invite: i
    }))
  return [...members, ...invites]
})

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return rows.value
  return rows.value.filter(r => r.name.toLowerCase().includes(q) || r.email.toLowerCase().includes(q))
})

function initials(name: string, email: string): string {
  return (name || email || '?').slice(0, 2).toUpperCase()
}
</script>

<template>
  <div class="space-y-3">
    <UInput
      v-model="query"
      icon="i-lucide-search"
      placeholder="Search members…"
      aria-label="Search members"
      class="w-full sm:max-w-xs"
    />

    <ul v-if="filtered.length" class="divide-y divide-default rounded-lg ring ring-default overflow-hidden">
      <li
        v-for="row in filtered"
        :key="row.key"
        class="flex items-center gap-3 p-3"
        :class="row.kind === 'member' && row.profile.blocked ? 'opacity-70' : ''"
      >
        <UAvatar
          :src="row.kind === 'member' ? (row.profile.avatar_url ?? undefined) : undefined"
          :alt="row.name"
          :text="initials(row.name, row.email)"
          size="sm"
          class="shrink-0"
        />
        <div class="min-w-0 flex-1">
          <p class="font-medium truncate flex items-center gap-1.5">
            {{ row.name }}
            <UBadge v-if="row.kind === 'member' && row.profile.is_admin" label="Admin" color="primary" variant="subtle" size="xs" />
            <UBadge v-if="row.kind === 'member' && row.profile.blocked" label="Blocked" color="error" variant="subtle" size="xs" />
            <UBadge v-if="row.kind === 'pending'" label="Pending" color="warning" variant="subtle" size="xs" />
          </p>
          <p class="text-xs text-muted truncate">
            {{ row.email || '—' }}
          </p>
        </div>

        <!-- Member actions: ban/unban (admins can't be banned from the UI). -->
        <template v-if="row.kind === 'member'">
          <UButton
            v-if="row.profile.blocked"
            label="Unban"
            icon="i-lucide-user-check"
            color="neutral"
            variant="outline"
            size="xs"
            class="shrink-0"
            @click="emit('unblock', row.profile)"
          />
          <UButton
            v-else-if="!row.profile.is_admin"
            label="Ban"
            icon="i-lucide-user-x"
            color="error"
            variant="outline"
            size="xs"
            class="shrink-0"
            @click="emit('block', row.profile)"
          />
        </template>
        <!-- Pending invite: revoke it. -->
        <UButton
          v-else
          label="Revoke"
          icon="i-lucide-x"
          color="neutral"
          variant="outline"
          size="xs"
          class="shrink-0"
          @click="emit('revoke', row.invite)"
        />
      </li>
    </ul>
    <p v-else class="text-sm text-muted">
      No members match.
    </p>
  </div>
</template>
