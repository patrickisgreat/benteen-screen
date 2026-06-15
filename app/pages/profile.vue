<script setup lang="ts">
definePageMeta({ middleware: 'auth' })
useSeoMeta({ title: 'Profile · BSOTG' })

const { user, isAdmin } = useAuth()
const { deleteAccount } = useAccount()
const toast = useToast()

const confirmOpen = ref(false)
const deleting = ref(false)

async function onDelete(): Promise<void> {
  deleting.value = true
  try {
    await deleteAccount()
    toast.add({ title: 'Account deleted', color: 'neutral' })
    await navigateTo('/')
  } catch (error) {
    toast.add({
      title: 'Could not delete account',
      description: error instanceof Error ? error.message : undefined,
      color: 'error'
    })
  } finally {
    deleting.value = false
    confirmOpen.value = false
  }
}
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

    <!-- Danger zone -->
    <UCard class="mt-6" :ui="{ root: 'ring-error/30' }">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 class="font-semibold text-error">
            Delete account
          </h3>
          <p class="text-sm text-muted">
            Permanently delete your account. This can't be undone.
          </p>
        </div>
        <UButton
          label="Delete account"
          color="error"
          variant="outline"
          icon="i-lucide-trash-2"
          class="w-full sm:w-auto justify-center"
          @click="confirmOpen = true"
        />
      </div>
    </UCard>

    <UModal
      v-model:open="confirmOpen"
      title="Delete your account?"
      description="This permanently deletes your account and sign-in. This action cannot be undone."
    >
      <template #footer>
        <div class="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 w-full">
          <UButton label="Cancel" color="neutral" variant="ghost" class="justify-center" @click="confirmOpen = false" />
          <UButton label="Delete account" color="error" icon="i-lucide-trash-2" class="justify-center" :loading="deleting" @click="onDelete" />
        </div>
      </template>
    </UModal>
  </UContainer>
</template>
