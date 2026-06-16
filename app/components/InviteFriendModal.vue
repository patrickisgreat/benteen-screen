<script setup lang="ts">
import { z } from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'

const open = defineModel<boolean>('open', { default: false })
const { sendInvite } = useInvites()
const toast = useToast()
const submitting = ref(false)

const schema = z.object({
  email: z.string().email('Enter a valid email'),
  name: z.string().trim().max(120).optional()
})
const state = reactive({ email: '', name: '' })

function messageOf(error: unknown): string | undefined {
  if (error && typeof error === 'object' && 'statusMessage' in error) {
    const m = (error as { statusMessage?: unknown }).statusMessage
    if (typeof m === 'string') return m
  }
  return error instanceof Error ? error.message : undefined
}

async function onSubmit(event: FormSubmitEvent<{ email: string, name?: string }>): Promise<void> {
  submitting.value = true
  try {
    const res = await sendInvite(event.data.email, event.data.name || undefined)
    toast.add({
      title: 'Invite sent',
      description: res.emailed
        ? `We emailed an invite to ${event.data.email}.`
        : `${event.data.email} was added to the guest list.`,
      icon: 'i-lucide-mail-check',
      color: 'success'
    })
    state.email = ''
    state.name = ''
    open.value = false
  } catch (error) {
    toast.add({
      title: 'Could not send invite',
      description: messageOf(error),
      icon: 'i-lucide-circle-alert',
      color: 'error'
    })
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    title="Invite a friend"
    description="Add them to the guest list and we'll email them an invite."
  >
    <template #body>
      <UForm :schema="schema" :state="state" class="space-y-4" @submit="onSubmit">
        <UFormField label="Their email" name="email" required>
          <UInput v-model="state.email" type="email" placeholder="friend@example.com" class="w-full" />
        </UFormField>
        <UFormField label="Their name" name="name" hint="Optional">
          <UInput v-model="state.name" placeholder="Jordan" class="w-full" />
        </UFormField>
        <div class="flex justify-end gap-2 pt-1">
          <UButton label="Cancel" color="neutral" variant="ghost" @click="open = false" />
          <UButton type="submit" label="Send invite" icon="i-lucide-send" :loading="submitting" />
        </div>
      </UForm>
    </template>
  </UModal>
</template>
