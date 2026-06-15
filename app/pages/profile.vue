<script setup lang="ts">
definePageMeta({ middleware: 'auth' })
useSeoMeta({ title: 'Profile · BSOTG' })

const { user, isAdmin } = useAuth()
</script>

<template>
  <UContainer class="py-12 max-w-2xl">
    <h1 class="text-3xl font-bold mb-6">
      Profile
    </h1>

    <UCard v-if="user">
      <div class="flex items-center gap-4">
        <UAvatar
          :src="user.photoURL ?? undefined"
          :alt="user.displayName ?? 'User'"
          size="3xl"
        />
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <h2 class="text-xl font-semibold truncate">
              {{ user.displayName }}
            </h2>
            <UBadge
              v-if="isAdmin"
              label="Admin"
              color="primary"
              variant="subtle"
              icon="i-lucide-shield"
            />
          </div>
          <p class="text-muted truncate">
            {{ user.email }}
          </p>
        </div>
      </div>

      <USeparator class="my-6" />

      <UFormField label="Email" help="Managed by your Google account.">
        <UInput :model-value="user.email ?? ''" readonly icon="i-lucide-mail" class="w-full" />
      </UFormField>
    </UCard>
  </UContainer>
</template>
