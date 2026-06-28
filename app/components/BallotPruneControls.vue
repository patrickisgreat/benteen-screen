<script setup lang="ts">
// Admin control to prune an event's ballot as the night nears: cut zero-vote
// titles, or keep only the top N by votes. Cuts are permanent (a confirm guards
// them); freed votes are refunded to voters server-side. Emits `pruned` with the
// number cut so the parent can refresh its list.
const props = defineProps<{ eventId: string }>()
const emit = defineEmits<{ pruned: [cut: number] }>()

const toast = useToast()
const { cullZeroVotes, cullToTop } = useBallotPruning(() => props.eventId)

// keepTop is a string: UInput type="number" writes a string back through v-model
// (see ParticipationLimitsSetting). Parse + clamp to a sane keep count.
const keepTop = ref('8')
const keepTopNum = computed(() => Math.max(1, Math.floor(Number(keepTop.value)) || 1))

const pending = ref<{ kind: 'zero' } | { kind: 'top', keep: number } | null>(null)
const prompt = computed(() => {
  const p = pending.value
  if (!p) return ''
  return p.kind === 'zero'
    ? 'Permanently cut every title with no votes yet? This can’t be undone.'
    : `Permanently cut everything except the top ${p.keep} by votes? Anyone who voted for a cut title gets that vote back. This can’t be undone.`
})

async function confirm(): Promise<void> {
  const action = pending.value
  pending.value = null
  if (!action) return
  try {
    const cut = action.kind === 'zero' ? await cullZeroVotes() : await cullToTop(action.keep)
    emit('pruned', cut)
    toast.add({
      title: cut ? `Cut ${cut} title${cut === 1 ? '' : 's'} from the ballot` : 'Nothing to cut',
      icon: 'i-lucide-scissors',
      color: cut ? 'success' : 'neutral'
    })
  } catch (error) {
    toast.add({ title: 'Could not prune the ballot', description: error instanceof Error ? error.message : undefined, color: 'error' })
  }
}
</script>

<template>
  <UCard variant="subtle">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="min-w-0">
        <h3 class="text-sm font-semibold flex items-center gap-1.5">
          <UIcon name="i-lucide-scissors" /> Prune the ballot
        </h3>
        <p class="text-xs text-muted mt-0.5">
          Trim the lineup as the night nears. Cuts are permanent; freed votes go back to voters.
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <UButton
          label="Cut zero-vote titles"
          icon="i-lucide-trash"
          color="neutral"
          variant="outline"
          size="sm"
          @click="pending = { kind: 'zero' }"
        />
        <div class="flex items-center gap-1.5">
          <span class="text-xs text-muted whitespace-nowrap">keep top</span>
          <UInput v-model="keepTop" type="number" min="1" size="sm" class="w-16" />
          <UButton
            label="Cut"
            icon="i-lucide-scissors"
            color="primary"
            size="sm"
            @click="pending = { kind: 'top', keep: keepTopNum }"
          />
        </div>
      </div>
    </div>

    <!-- Permanent — confirm before cutting. -->
    <UModal
      :open="Boolean(pending)"
      title="Prune the ballot?"
      :description="prompt"
      @update:open="(value) => { if (!value) pending = null }"
    >
      <template #footer>
        <div class="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 w-full">
          <UButton label="Cancel" color="neutral" variant="ghost" class="justify-center" @click="pending = null" />
          <UButton label="Cut titles" color="primary" icon="i-lucide-scissors" class="justify-center" @click="confirm" />
        </div>
      </template>
    </UModal>
  </UCard>
</template>
