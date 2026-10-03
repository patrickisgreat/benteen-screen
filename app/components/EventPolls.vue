<script setup lang="ts">
import { POLL_MAX_OPTIONS, POLL_MIN_OPTIONS, POLL_OPTION_MAX, POLL_QUESTION_MAX, parsePollRequest, type PollResults } from '#shared/utils/poll'

// Ask the guest list a question (e.g. "move to Saturday?"). Sending creates the
// poll and emails every e-vited guest their own one-tap answer buttons; results
// stream in live below as people tap. Admin-gated server-side and by RLS.
const props = defineProps<{ eventId: string | undefined }>()
const toast = useToast()
const { run } = useToastAction()
const { polls, sendPoll, closePoll, removePoll } = usePolls(() => props.eventId)

const question = ref('')
const note = ref('')
const options = ref<string[]>(['', ''])
const sending = ref(false)

const draft = computed(() => parsePollRequest({
  question: question.value,
  options: options.value.filter(o => o.trim()),
  note: note.value || undefined
}))
const canSend = computed(() => Boolean(props.eventId) && draft.value.ok)

function addOption(): void {
  if (options.value.length < POLL_MAX_OPTIONS) options.value = [...options.value, '']
}

function removeOption(index: number): void {
  options.value = options.value.filter((_, i) => i !== index)
}

function resetDraft(): void {
  question.value = ''
  note.value = ''
  options.value = ['', '']
}

async function onSend(): Promise<void> {
  const parsed = draft.value
  if (!parsed.ok) {
    toast.add({ title: parsed.error, color: 'warning' })
    return
  }
  sending.value = true
  try {
    const { sent, failed, error } = await sendPoll(parsed.value)
    if (sent && failed) {
      toast.add({ title: `Poll sent to ${sent}, ${failed} failed`, description: error ?? undefined, icon: 'i-lucide-send', color: 'warning' })
    } else if (sent) {
      toast.add({ title: `Poll sent to ${sent} ${sent === 1 ? 'guest' : 'guests'}`, icon: 'i-lucide-send', color: 'success' })
    } else {
      // The poll exists but reached no one — say so rather than imply it went out.
      toast.add({ title: 'The poll was created but could not be emailed', description: error ?? undefined, color: 'error' })
    }
    if (sent) resetDraft()
  } catch (error) {
    toast.add({ title: 'Could not send the poll', description: errorMessage(error), color: 'error' })
  } finally {
    sending.value = false
  }
}

async function onClose(poll: PollResults): Promise<void> {
  if (await run(() => closePoll(poll.id), 'Could not close the poll')) {
    toast.add({ title: 'Poll closed', icon: 'i-lucide-check', color: 'success' })
  }
}

async function onRemove(poll: PollResults): Promise<void> {
  if (await run(() => removePoll(poll.id), 'Could not delete the poll')) {
    toast.add({ title: 'Poll deleted', icon: 'i-lucide-check', color: 'neutral' })
  }
}

/** Share of the votes an option holds, for its results bar. */
function share(votes: number, total: number): number {
  return total ? Math.round((votes / total) * 100) : 0
}
</script>

<template>
  <div class="space-y-4">
    <div>
      <h3 class="text-sm font-semibold text-muted">
        Poll the guest list
      </h3>
      <p class="text-xs text-muted">
        Everyone who was e-vited gets an email with one button per choice. One tap answers; no sign-in.
      </p>
    </div>

    <form
      class="space-y-3"
      @submit.prevent="onSend"
    >
      <UFormField
        label="Question"
        required
      >
        <UInput
          v-model="question"
          :maxlength="POLL_QUESTION_MAX"
          placeholder="Should we move movie night to Saturday?"
          class="w-full"
        />
      </UFormField>

      <UFormField
        label="Choices"
        required
        :hint="`${POLL_MIN_OPTIONS}–${POLL_MAX_OPTIONS}`"
      >
        <div class="space-y-2">
          <div
            v-for="(_, index) in options"
            :key="index"
            class="flex gap-2"
          >
            <UInput
              v-model="options[index]"
              :maxlength="POLL_OPTION_MAX"
              :placeholder="`Choice ${index + 1}`"
              :aria-label="`Choice ${index + 1}`"
              class="flex-1"
            />
            <UButton
              v-if="options.length > POLL_MIN_OPTIONS"
              icon="i-lucide-x"
              color="neutral"
              variant="ghost"
              :aria-label="`Remove choice ${index + 1}`"
              @click="removeOption(index)"
            />
          </div>
          <UButton
            v-if="options.length < POLL_MAX_OPTIONS"
            label="Add a choice"
            icon="i-lucide-plus"
            color="neutral"
            variant="link"
            size="xs"
            class="px-0"
            @click="addOption"
          />
        </div>
      </UFormField>

      <UFormField
        label="Note"
        hint="Optional"
      >
        <UTextarea
          v-model="note"
          :rows="2"
          placeholder="A line of context shown above the buttons"
          class="w-full"
        />
      </UFormField>

      <div class="flex justify-end">
        <UButton
          type="submit"
          label="Send poll to guests"
          icon="i-lucide-vote"
          :loading="sending"
          :disabled="!canSend"
        />
      </div>
    </form>

    <div
      v-if="polls.length"
      class="space-y-2"
    >
      <UCard
        v-for="poll in polls"
        :key="poll.id"
        variant="subtle"
        :ui="{ body: 'p-3' }"
        data-testid="poll"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="text-sm font-medium break-words">
              {{ poll.question }}
            </p>
            <p class="text-xs text-muted">
              {{ poll.totalVotes }} answer{{ poll.totalVotes === 1 ? '' : 's' }} · {{ formatDateTime(poll.createdAt) }}
            </p>
          </div>
          <div class="flex items-center gap-1 shrink-0">
            <UBadge
              v-if="poll.closedAt"
              label="Closed"
              color="neutral"
              variant="subtle"
              size="sm"
            />
            <UButton
              v-else
              label="Close"
              color="neutral"
              variant="ghost"
              size="xs"
              @click="onClose(poll)"
            />
            <UButton
              icon="i-lucide-trash-2"
              color="neutral"
              variant="ghost"
              size="xs"
              aria-label="Delete poll"
              @click="onRemove(poll)"
            />
          </div>
        </div>

        <ul class="mt-3 space-y-2">
          <li
            v-for="option in poll.options"
            :key="option.id"
          >
            <div class="flex items-baseline justify-between gap-2 text-sm">
              <span class="break-words">{{ option.label }}</span>
              <span class="shrink-0 font-medium">{{ option.votes }}</span>
            </div>
            <div class="mt-1 h-1.5 rounded-full bg-elevated overflow-hidden">
              <div
                class="h-full bg-primary rounded-full"
                :style="{ width: `${share(option.votes, poll.totalVotes)}%` }"
              />
            </div>
            <p
              v-if="option.voters.length"
              class="mt-1 text-xs text-muted break-words"
            >
              {{ option.voters.join(', ') }}
            </p>
          </li>
        </ul>
      </UCard>
    </div>
  </div>
</template>
