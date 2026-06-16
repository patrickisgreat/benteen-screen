<script setup lang="ts">
import { z } from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'

// Landing page for the password-recovery link. The recovery token establishes a
// session (handled by the Supabase module); here the user actually sets a new
// password via updateUser, then continues into the app. Public + layout-less so
// the invite gate and app shell don't interfere with the recovery session.
definePageMeta({ layout: false })
useSeoMeta({ title: 'Reset password · BSOTG' })

const supabase = useSupabaseClient()
const toast = useToast()
const submitting = ref(false)

const schema = z.object({
  password: z.string().min(8, 'At least 8 characters')
})
const state = reactive({ password: '' })

async function onSubmit(event: FormSubmitEvent<{ password: string }>): Promise<void> {
  submitting.value = true
  try {
    const { error } = await supabase.auth.updateUser({ password: event.data.password })
    if (error) throw error
    toast.add({ title: 'Password updated', icon: 'i-lucide-check', color: 'success' })
    await navigateTo('/overview')
  } catch (error) {
    toast.add({
      title: 'Could not update your password',
      description: error instanceof Error ? error.message : 'The link may have expired — request a new one.',
      icon: 'i-lucide-circle-alert',
      color: 'error'
    })
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-500/10 via-default to-primary-500/5 px-4 py-10">
    <UCard class="w-full max-w-md">
      <div class="flex flex-col items-center text-center gap-4 py-2">
        <img src="/img/logo.png" alt="Benteen Screen On The Green" class="h-16 w-auto">
        <div>
          <h1 class="text-2xl font-bold">
            Set a new password
          </h1>
          <p class="mt-1 text-muted">
            Choose a new password for your account.
          </p>
        </div>

        <UForm :schema="schema" :state="state" class="w-full space-y-3 text-left" @submit="onSubmit">
          <UFormField label="New password" name="password">
            <UInput v-model="state.password" type="password" autocomplete="new-password" placeholder="••••••••" class="w-full" />
          </UFormField>
          <UButton type="submit" label="Update password" size="lg" block :loading="submitting" />
        </UForm>

        <UButton to="/login" color="neutral" variant="link" label="Back to sign in" />
      </div>
    </UCard>
  </div>
</template>
