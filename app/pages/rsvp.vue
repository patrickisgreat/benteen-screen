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

const HEADLINE: Record<RsvpStatus, string> = {
  going: "You're going! 🎉",
  maybe: 'Marked as maybe 🤔',
  no: "Sorry you'll miss it"
}

function isStatus(value: string): value is RsvpStatus {
  return value === 'going' || value === 'maybe' || value === 'no'
}

async function rsvp(status: RsvpStatus): Promise<void> {
  if (!token.value) { phase.value = 'error'; return }
  phase.value = 'saving'
  try {
    await $fetch('/api/rsvp', { method: 'POST', body: { token: token.value, status } })
    current.value = status
    phase.value = 'done'
  } catch {
    phase.value = 'error'
  }
}

onMounted(() => {
  const requested = (route.query.status ?? '').toString()
  if (isStatus(requested)) {
    void rsvp(requested)
  } else {
    phase.value = 'error'
  }
})
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-500/10 via-default to-primary-500/5 px-4 py-10">
    <UCard class="w-full max-w-md">
      <div class="flex flex-col items-center text-center gap-4 py-2">
        <img src="/img/logo.png" alt="Benteen Screen On The Green" class="h-14 w-auto">

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
