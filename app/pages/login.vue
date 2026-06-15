<script setup lang="ts">
definePageMeta({ layout: false })

const { user, signInWithGoogle } = useAuth()
const toast = useToast()
const loading = ref(false)

// Already signed in? Skip the login screen.
watchEffect(() => {
  if (user.value) {
    navigateTo('/overview')
  }
})

async function handleSignIn(): Promise<void> {
  loading.value = true
  try {
    // Redirects to Google, then back to /confirm — this page unloads.
    await signInWithGoogle()
  } catch (error) {
    loading.value = false
    toast.add({
      title: 'Sign in failed',
      description: error instanceof Error ? error.message : 'Please try again.',
      color: 'error',
      icon: 'i-lucide-circle-alert'
    })
  }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-500/10 via-default to-primary-500/5 px-4">
    <UCard class="w-full max-w-md">
      <div class="flex flex-col items-center text-center gap-4 py-4">
        <img src="/img/logo.png" alt="Benteen Screen On The Green" class="h-16 w-auto">
        <div>
          <h1 class="text-2xl font-bold">
            Welcome back
          </h1>
          <p class="mt-1 text-muted">
            Sign in to vote for the next movie night.
          </p>
        </div>

        <UButton
          label="Continue with Google"
          icon="i-simple-icons-google"
          size="lg"
          block
          color="neutral"
          variant="outline"
          :loading="loading"
          class="mt-2"
          @click="handleSignIn"
        />

        <p class="text-xs text-dimmed mt-2">
          By signing in you agree to the Terms of Service and Privacy Policy.
        </p>
      </div>
    </UCard>
  </div>
</template>
