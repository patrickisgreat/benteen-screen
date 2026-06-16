<script setup lang="ts">
useSeoMeta({ title: 'Request access · BSOTG' })

// Invite-only: anyone not on the allowlist lands here (and is signed out by the
// invited.global middleware). They can ask an existing member, or email for an
// invite to the next movie night.
const requestUrl = 'mailto:patrickisgreat@gmail.com?subject=BSOTG%20invite%20request&body=Hi%2C%20please%20add%20me%20to%20Benteen%20Screen%20On%20The%20Green.'
</script>

<template>
  <UContainer class="py-20">
    <div class="max-w-md mx-auto text-center space-y-4">
      <UIcon name="i-lucide-lock-keyhole" class="size-10 text-muted mx-auto" />
      <h1 class="text-2xl font-bold">
        Benteen Screen is invite-only
      </h1>
      <p class="text-muted">
        Your account isn't on the guest list yet. Ask a member to invite you, or
        request an invite and we'll add you to the next movie night.
      </p>
      <div class="flex flex-col sm:flex-row gap-2 justify-center pt-2">
        <UButton :to="requestUrl" external icon="i-lucide-mail" label="Request an invite" />
        <UButton to="/login" color="neutral" variant="outline" icon="i-lucide-arrow-left" label="Back to sign in" />
      </div>
    </div>
  </UContainer>
</template>
