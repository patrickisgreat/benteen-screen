<script setup lang="ts">
import { z } from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'

definePageMeta({ layout: false })

const {
  user,
  signInWithGoogle,
  signInWithFacebook,
  signInWithEmail,
  signUpWithEmail,
  sendPasswordReset
} = useAuth()
const toast = useToast()

const oauthLoading = ref<'google' | 'facebook' | null>(null)
const submitting = ref(false)
const mode = ref<'signin' | 'signup'>('signin')

// Already signed in? Skip the login screen (the invite gate runs downstream).
watchEffect(() => {
  if (user.value) navigateTo('/overview')
})

const schema = computed(() =>
  z.object({
    email: z.string().email('Enter a valid email'),
    password: mode.value === 'signup'
      ? z.string().min(8, 'At least 8 characters')
      : z.string().min(1, 'Enter your password')
  })
)
const state = reactive({ email: '', password: '' })

function notifyError(error: unknown, fallback: string): void {
  toast.add({
    title: fallback,
    description: error instanceof Error ? error.message : undefined,
    color: 'error',
    icon: 'i-lucide-circle-alert'
  })
}

async function startOAuth(provider: 'google' | 'facebook'): Promise<void> {
  oauthLoading.value = provider
  try {
    await (provider === 'google' ? signInWithGoogle() : signInWithFacebook())
    // Redirects away on success — this page unloads.
  } catch (error) {
    oauthLoading.value = null
    notifyError(error, 'Sign in failed')
  }
}

async function onSubmit(event: FormSubmitEvent<{ email: string, password: string }>): Promise<void> {
  submitting.value = true
  const { email, password } = event.data
  try {
    if (mode.value === 'signup') {
      await signUpWithEmail(email, password)
      toast.add({
        title: 'Check your email',
        description: 'Confirm your address to finish signing up.',
        color: 'success',
        icon: 'i-lucide-mail-check'
      })
    } else {
      await signInWithEmail(email, password)
      // On success the user populates and watchEffect routes to /overview.
    }
  } catch (error) {
    notifyError(error, mode.value === 'signup' ? 'Could not sign up' : 'Could not sign in')
  } finally {
    submitting.value = false
  }
}

async function onForgotPassword(): Promise<void> {
  const email = state.email.trim()
  if (!z.string().email().safeParse(email).success) {
    toast.add({ title: 'Enter your email first', description: 'Then tap “Forgot password”.', color: 'warning' })
    return
  }
  try {
    await sendPasswordReset(email)
    toast.add({ title: 'Reset link sent', description: `Check ${email} for a password reset link.`, color: 'success' })
  } catch (error) {
    notifyError(error, 'Could not send reset link')
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
            {{ mode === 'signup' ? 'Create your account' : 'Welcome back' }}
          </h1>
          <p class="mt-1 text-muted">
            {{ mode === 'signup' ? 'Sign up to join the next movie night.' : 'Sign in to vote for the next movie night.' }}
          </p>
        </div>

        <div class="w-full space-y-2">
          <UButton
            label="Continue with Google"
            icon="i-simple-icons-google"
            size="lg"
            block
            color="neutral"
            variant="outline"
            :loading="oauthLoading === 'google'"
            :disabled="oauthLoading !== null"
            @click="startOAuth('google')"
          />
          <UButton
            label="Continue with Facebook"
            icon="i-simple-icons-facebook"
            size="lg"
            block
            color="neutral"
            variant="outline"
            :loading="oauthLoading === 'facebook'"
            :disabled="oauthLoading !== null"
            @click="startOAuth('facebook')"
          />
        </div>

        <USeparator label="or" class="w-full" />

        <UForm :schema="schema" :state="state" class="w-full space-y-3 text-left" @submit="onSubmit">
          <UFormField label="Email" name="email">
            <UInput v-model="state.email" type="email" autocomplete="email" placeholder="you@example.com" class="w-full" />
          </UFormField>
          <UFormField label="Password" name="password">
            <UInput
              v-model="state.password"
              type="password"
              :autocomplete="mode === 'signup' ? 'new-password' : 'current-password'"
              placeholder="••••••••"
              class="w-full"
            />
          </UFormField>

          <UButton
            type="submit"
            :label="mode === 'signup' ? 'Sign up' : 'Sign in'"
            size="lg"
            block
            :loading="submitting"
          />
        </UForm>

        <div class="w-full flex items-center justify-between text-sm">
          <button type="button" class="text-primary hover:underline" @click="mode = mode === 'signup' ? 'signin' : 'signup'">
            {{ mode === 'signup' ? 'Have an account? Sign in' : 'New here? Create an account' }}
          </button>
          <button v-if="mode === 'signin'" type="button" class="text-muted hover:underline" @click="onForgotPassword">
            Forgot password?
          </button>
        </div>

        <p class="text-xs text-dimmed">
          Benteen Screen is invite-only. By signing in you agree to the Terms of Service and Privacy Policy.
        </p>
      </div>
    </UCard>
  </div>
</template>
