<script setup lang="ts">
// Admin control for the per-event participation caps (app_settings.max_suggestions
// / max_votes). RLS enforces admin-only writes; blank = the defaults in limits.ts.
const { maxSuggestions, maxVotes, setParticipationCaps } = useAppSettings()
const toast = useToast()
// UInput type="number" writes a *string* back through v-model at runtime (no
// `.number` coercion), even though its model types as number|null — so clean()
// accepts a string too and normalizes whatever the field actually holds.
const suggestionsDraft = ref<number | null>(null)
const votesDraft = ref<number | null>(null)
const saving = ref(false)

watch(maxSuggestions, (v) => {
  suggestionsDraft.value = v
}, { immediate: true })
watch(maxVotes, (v) => {
  votesDraft.value = v
}, { immediate: true })

function clean(value: number | string | null): number | null {
  const n = Number(value)
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : null
}

async function save(): Promise<void> {
  saving.value = true
  try {
    const s = clean(suggestionsDraft.value)
    const v = clean(votesDraft.value)
    await setParticipationCaps(s, v)
    suggestionsDraft.value = s
    votesDraft.value = v
    toast.add({ title: 'Participation limits saved', icon: 'i-lucide-check', color: 'success' })
  } catch {
    toast.add({ title: 'Could not save the limits', color: 'error' })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <UCard variant="subtle">
    <div class="flex flex-wrap items-end gap-3">
      <UFormField label="Suggestions per person" :hint="`Blank = default (${SUGGESTION_LIMIT})`" class="flex-1 min-w-32">
        <UInput v-model="suggestionsDraft" type="number" min="1" :placeholder="String(SUGGESTION_LIMIT)" class="w-full" />
      </UFormField>
      <UFormField label="Votes per person" :hint="`Blank = default (${VOTE_LIMIT})`" class="flex-1 min-w-32">
        <UInput v-model="votesDraft" type="number" min="1" :placeholder="String(VOTE_LIMIT)" class="w-full" />
      </UFormField>
      <UButton label="Save" icon="i-lucide-save" :loading="saving" @click="save" />
    </div>
    <p class="text-xs text-muted mt-2">
      Caps how many movies each person can suggest and how many they can vote for, per event. Enforced server-side.
    </p>
  </UCard>
</template>
