<script setup lang="ts">
// OAuth callback. @nuxtjs/supabase exchanges the code for a session on load;
// once the user is populated we send them into the app.
definePageMeta({ layout: false })

const user = useSupabaseUser()

watch(user, () => {
  if (user.value) navigateTo('/overview')
}, { immediate: true })
</script>

<template>
  <div class="min-h-screen flex items-center justify-center">
    <div class="text-center">
      <UIcon name="i-lucide-loader-circle" class="size-8 animate-spin text-primary mx-auto" />
      <p class="mt-3 text-muted">
        Signing you in…
      </p>
    </div>
  </div>
</template>
