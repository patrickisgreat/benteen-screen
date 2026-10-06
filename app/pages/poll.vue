<script setup lang="ts">
import type { PollBallot } from '#shared/utils/poll'

// Public landing for the one-tap answer links in a poll email. It POSTs the
// choice on mount — email prefetchers don't run JS, so a link prefetch won't
// cast a vote; only a real tap does. The guest's e-vite token authenticates.
definePageMeta({ layout: false })
useSeoMeta({ title: 'Poll · BSOTG' })

const route = useRoute()
const token = computed(() => (route.query.token ?? '').toString())
const pollId = computed(() => (route.query.poll ?? '').toString())

const phase = ref<'saving' | 'done' | 'error'>('saving')
const ballot = ref<PollBallot | null>(null)
const chosenLabel = computed(() => ballot.value?.options.find(o => o.id === ballot.value?.chosen)?.label ?? null)

async function vote(optionId: string): Promise<void> {
  if (!token.value || !pollId.value || !optionId) {
    phase.value = 'error'
    return
  }
  phase.value = 'saving'
  try {
    ballot.value = await $fetch<PollBallot>('/api/poll-vote', {
      method: 'POST',
      body: { token: token.value, pollId: pollId.value, optionId }
    })
    phase.value = 'done'
  } catch {
    phase.value = 'error'
  }
}

onMounted(() => {
  void vote((route.query.option ?? '').toString())
})
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-500/10 via-default to-primary-500/5 px-4 py-10">
    <UCard class="w-full max-w-md">
      <div class="flex flex-col items-center text-center gap-4 py-2">
        <img
          src="/img/bsotg_logo.svg"
          alt="Benteen Screen On The Green"
          class="h-14 w-auto"
        >

        <template v-if="phase === 'done' && ballot">
          <p class="text-muted">
            {{ ballot.question }}
          </p>

          <template v-if="ballot.closed">
            <h1 class="text-2xl font-bold">
              This poll has closed
            </h1>
            <p class="text-muted">
              {{ chosenLabel ? `Your answer was “${chosenLabel}”.` : 'It closed before your answer came in.' }}
            </p>
          </template>

          <template v-else>
            <h1 class="text-2xl font-bold">
              Got it: {{ chosenLabel }}
            </h1>
            <p class="text-muted">
              You can change your answer anytime:
            </p>
            <div class="flex w-full flex-col gap-2">
              <UButton
                v-for="option in ballot.options"
                :key="option.id"
                :label="option.label"
                :variant="option.id === ballot.chosen ? 'solid' : 'outline'"
                block
                @click="vote(option.id)"
              />
            </div>
          </template>
        </template>

        <template v-else-if="phase === 'error'">
          <UIcon
            name="i-lucide-circle-alert"
            class="size-8 text-error"
          />
          <h1 class="text-xl font-bold">
            We couldn't record that
          </h1>
          <p class="text-muted">
            This link may have expired. Try the buttons in the email again.
          </p>
        </template>

        <template v-else>
          <UIcon
            name="i-lucide-loader-circle"
            class="size-8 animate-spin text-primary"
          />
          <p class="text-muted">
            Recording your answer…
          </p>
        </template>
      </div>
    </UCard>
  </div>
</template>
