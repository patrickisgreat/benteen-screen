<script setup lang="ts">
import type { RsvpStatus } from '#shared/types/rsvp'

// Public landing for the one-click RSVP links in an e-vite. It POSTs the choice
// on mount — email prefetchers don't run JS, so an accidental link prefetch
// won't record an RSVP; only a real click does. The token authenticates.
definePageMeta({ layout: false })
useSeoMeta({ title: 'RSVP · BSOTG' })

const route = useRoute()
const token = computed(() => (route.query.token ?? '').toString())

const phase = ref<'saving' | 'done' | 'error'>('saving')
const current = ref<RsvpStatus | null>(null)
const guests = ref(0)
// Updating the guest count re-saves in the background (no full-screen spinner) —
// this flag just disables the stepper for the in-flight request.
const savingGuests = ref(false)

const HEADLINE: Record<RsvpStatus, string> = {
  going: 'You\'re going! 🎉',
  maybe: 'Marked as maybe 🤔',
  no: 'Sorry you\'ll miss it'
}

function isStatus(value: string): value is RsvpStatus {
  return value === 'going' || value === 'maybe' || value === 'no'
}

/** Record a reply. `keepGuests` is the email-link case: the link only says
 *  going/maybe/no, so the server keeps whatever guest count they already had
 *  (re-confirming "going" must not drop their +1s) and tells us what it is. */
async function rsvp(status: RsvpStatus, keepGuests = false): Promise<void> {
  if (!token.value) {
    phase.value = 'error'
    return
  }
  // Guests only ride along with going; switching away resets the local count.
  if (status !== 'going') guests.value = 0
  phase.value = 'saving'
  try {
    const recorded = await $fetch<{ plusOnes: number }>('/api/rsvp', {
      method: 'POST',
      body: { token: token.value, status, plusOnes: keepGuests ? undefined : guests.value }
    })
    guests.value = recorded.plusOnes
    current.value = status
    phase.value = 'done'
  } catch {
    phase.value = 'error'
  }
}

/** Update the guest count and re-save in the background (only while going). Keeps
 *  the "done" view up (no spinner flicker on every tap) and disables the stepper for
 *  the in-flight request. */
async function setGuests(count: number): Promise<void> {
  guests.value = count
  if (current.value !== 'going' || !token.value) return
  savingGuests.value = true
  try {
    await $fetch('/api/rsvp', { method: 'POST', body: { token: token.value, status: 'going', plusOnes: count } })
  } catch {
    phase.value = 'error'
  } finally {
    savingGuests.value = false
  }
}

onMounted(() => {
  const requested = (route.query.status ?? '').toString()
  if (isStatus(requested)) {
    void rsvp(requested, true)
  } else {
    phase.value = 'error'
  }
})
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-500/10 via-default to-primary-500/5 px-4 py-10">
    <UCard class="w-full max-w-md">
      <div class="flex flex-col items-center text-center gap-4 py-2">
        <img src="/img/bsotg_logo.svg" alt="Benteen Screen On The Green" class="h-14 w-auto">

        <template v-if="phase === 'done'">
          <h1 class="text-2xl font-bold">
            {{ current ? HEADLINE[current] : 'Thanks!' }}
          </h1>
          <p class="text-muted">
            You can change your answer anytime:
          </p>
          <div class="flex flex-wrap justify-center gap-2">
            <UButton label="Going" color="primary" :variant="current === 'going' ? 'solid' : 'outline'" @click="rsvp('going')" />
            <UButton label="Maybe" color="warning" :variant="current === 'maybe' ? 'solid' : 'outline'" @click="rsvp('maybe')" />
            <UButton label="Can't make it" color="neutral" :variant="current === 'no' ? 'solid' : 'outline'" @click="rsvp('no')" />
          </div>

          <!-- Bringing guests? Only while going. -->
          <div v-if="current === 'going'" class="flex flex-col items-center gap-2 pt-1">
            <span class="text-sm text-muted">Bringing guests?</span>
            <GuestStepper :model-value="guests" :disabled="savingGuests" @update:model-value="setGuests" />
          </div>
        </template>

        <template v-else-if="phase === 'error'">
          <UIcon name="i-lucide-circle-alert" class="size-8 text-error" />
          <h1 class="text-xl font-bold">
            We couldn't record that
          </h1>
          <p class="text-muted">
            This link may have expired. Try the buttons in your invite email again.
          </p>
        </template>

        <template v-else>
          <UIcon name="i-lucide-loader-circle" class="size-8 animate-spin text-primary" />
          <p class="text-muted">
            Recording your RSVP…
          </p>
        </template>
      </div>
    </UCard>
  </div>
</template>
