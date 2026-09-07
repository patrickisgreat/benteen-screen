<script setup lang="ts">
import { z } from 'zod'
import type { GuestCandidate } from '#shared/utils/guestDirectory'

// The "add a guest" field for an event's list: one input that live-searches the
// club directory (members, roster, past guests) by name or email, with a manual
// email + optional name fallback for someone brand new. Either path emits `add`;
// the parent owns the insert.
const props = withDefaults(defineProps<{ exclude?: readonly string[] }>(), { exclude: () => [] })
const emit = defineEmits<{ add: [email: string, name?: string] }>()

const toast = useToast()
const { candidates, pending, error } = useGuestDirectory()
const emailSchema = z.string().email()

const query = ref('')
const newName = ref('')

const matches = computed(() => searchGuestCandidates(candidates.value, query.value, props.exclude))
const queryIsEmail = computed(() => emailSchema.safeParse(query.value.trim()).success)
// A typed email that's already in the directory — adding them should keep their name.
const exactMatch = computed(() => matches.value.find(c => c.email === query.value.trim().toLowerCase()) ?? null)

function pick(candidate: GuestCandidate): void {
  emit('add', candidate.email, candidate.display_name ?? undefined)
  query.value = ''
  newName.value = ''
}

function addTyped(): void {
  const email = query.value.trim().toLowerCase()
  if (!emailSchema.safeParse(email).success) {
    toast.add({ title: 'Pick a match or enter a valid email', color: 'warning' })
    return
  }
  emit('add', email, newName.value.trim() || undefined)
  query.value = ''
  newName.value = ''
}

// Enter picks the directory entry when the text is exactly their email or the
// only match; otherwise it adds the typed email as someone new.
function onEnter(): void {
  const match = exactMatch.value ?? (matches.value.length === 1 && !queryIsEmail.value ? matches.value[0]! : null)
  if (match) pick(match)
  else addTyped()
}
</script>

<template>
  <div class="space-y-2">
    <div class="flex flex-wrap items-end gap-2">
      <UFormField label="Add a guest" class="flex-1 min-w-48">
        <UInput
          v-model="query"
          icon="i-lucide-search"
          :loading="pending"
          placeholder="Search by name, or type an email"
          aria-label="Search people or enter an email"
          class="w-full"
          @keydown.enter.prevent="onEnter"
        />
      </UFormField>
      <UFormField label="Name" hint="optional" class="min-w-32">
        <UInput v-model="newName" placeholder="Jordan" class="w-full" @keydown.enter.prevent="addTyped" />
      </UFormField>
      <UButton label="Add" icon="i-lucide-plus" :disabled="!queryIsEmail" @click="addTyped" />
    </div>

    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      title="Couldn't load the directory"
      :description="error"
    />

    <!-- Live matches from the directory -->
    <ul v-if="matches.length" class="divide-y divide-default rounded-lg ring ring-default overflow-hidden" aria-label="Matching people">
      <li v-for="c in matches" :key="c.email">
        <button
          type="button"
          class="flex w-full items-center gap-3 p-2.5 text-left hover:bg-elevated transition"
          :aria-label="`Add ${c.display_name ?? c.email}`"
          @click="pick(c)"
        >
          <div class="min-w-0 flex-1">
            <p class="font-medium truncate">
              {{ c.display_name ?? c.email }}
            </p>
            <p v-if="c.display_name" class="text-xs text-muted truncate">
              {{ c.email }}
            </p>
          </div>
          <UBadge :label="GUEST_SOURCE_LABELS[c.source]" color="neutral" variant="subtle" size="xs" class="shrink-0" />
          <UIcon name="i-lucide-plus" class="shrink-0 text-muted" />
        </button>
      </li>
    </ul>
    <p v-else-if="queryIsEmail" class="text-xs text-muted px-1">
      Not in the directory yet — hit Add to invite them.
    </p>
    <p v-else-if="query.trim()" class="text-xs text-muted px-1">
      No one matches — finish typing an email to add someone new.
    </p>
  </div>
</template>
