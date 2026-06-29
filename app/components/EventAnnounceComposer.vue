<script setup lang="ts">
import { z } from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'

// Admin event blast composer → POST /api/events/announce (admin-gated server-side).
const props = defineProps<{ eventId: string | undefined }>()
const toast = useToast()
const sending = ref(false)

const scopeOptions = [
  { label: 'Everyone invited', value: 'invited' as const },
  { label: 'Members (joined)', value: 'members' as const },
  { label: 'Going to this event', value: 'going' as const }
]
type Scope = (typeof scopeOptions)[number]['value']

const schema = z.object({
  subject: z.string().trim().max(200).optional(),
  message: z.string().trim().min(1, 'Write a message'),
  scope: z.enum(['invited', 'members', 'going'])
})
const state = reactive<{ subject: string, message: string, scope: Scope }>({
  subject: '',
  message: '',
  scope: 'members'
})

function messageOf(error: unknown): string | undefined {
  if (error && typeof error === 'object' && 'statusMessage' in error) {
    const m = (error as { statusMessage?: unknown }).statusMessage
    if (typeof m === 'string') return m
  }
  return error instanceof Error ? error.message : undefined
}

async function onSubmit(event: FormSubmitEvent<{ subject?: string, message: string, scope: Scope }>): Promise<void> {
  if (!props.eventId) {
    toast.add({ title: 'Pick an event first', color: 'warning' })
    return
  }
  sending.value = true
  try {
    const res = await $fetch<{ ok: boolean, count: number, failed?: number, error?: string | null }>('/api/events/announce', {
      method: 'POST',
      body: { eventId: props.eventId, subject: event.data.subject || undefined, message: event.data.message, scope: event.data.scope }
    })
    const failed = res.failed ?? 0
    if (res.count && failed) {
      // Partial delivery — some groups went out, some didn't (don't pretend full success).
      toast.add({ title: `Sent to ${res.count}, ${failed} failed`, description: res.error ?? undefined, icon: 'i-lucide-send', color: 'warning' })
    } else if (res.count) {
      toast.add({ title: `Sent to ${res.count} ${res.count === 1 ? 'person' : 'people'}`, icon: 'i-lucide-send', color: 'success' })
    } else if (failed) {
      toast.add({ title: 'Could not send the blast', description: res.error ?? undefined, color: 'error' })
    } else {
      toast.add({ title: 'No recipients matched', color: 'warning' })
    }
    // Keep the draft if nothing went out, so the admin can retry.
    if (res.count) {
      state.subject = ''
      state.message = ''
    }
  } catch (error) {
    toast.add({ title: 'Could not send the blast', description: messageOf(error), color: 'error' })
  } finally {
    sending.value = false
  }
}
</script>

<template>
  <UForm :schema="schema" :state="state" class="space-y-3" @submit="onSubmit">
    <UFormField label="Audience" name="scope">
      <USelectMenu
        v-model="state.scope"
        :items="scopeOptions"
        value-key="value"
        :search-input="false"
        class="w-full sm:max-w-xs"
      />
    </UFormField>
    <UFormField label="Subject" name="subject" hint="Optional">
      <UInput v-model="state.subject" placeholder="Movie night reminder" class="w-full" />
    </UFormField>
    <UFormField label="Message" name="message" required>
      <UTextarea v-model="state.message" :rows="5" placeholder="Doors at 7, first film at 7:30…" class="w-full" />
    </UFormField>
    <div class="flex justify-end">
      <UButton type="submit" label="Send blast" icon="i-lucide-megaphone" :loading="sending" :disabled="!eventId" />
    </div>
  </UForm>
</template>
