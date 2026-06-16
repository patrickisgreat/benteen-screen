<script setup lang="ts">
// Admin control for the total invite cap (app_settings.max_invites). RLS enforces
// admin-only writes; this lives behind the admin page.
const { maxInvites, setMaxInvites } = useAppSettings()
const toast = useToast()
const draft = ref<number | null>(null)
const saving = ref(false)

watch(maxInvites, (value) => {
  draft.value = value
}, { immediate: true })

async function save(): Promise<void> {
  saving.value = true
  try {
    const n = Number(draft.value)
    const value = Number.isFinite(n) && n > 0 ? Math.floor(n) : null
    await setMaxInvites(value)
    draft.value = value
    toast.add({ title: 'Invite limit saved', icon: 'i-lucide-check', color: 'success' })
  } catch {
    toast.add({ title: 'Could not save the limit', color: 'error' })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <UCard variant="subtle">
    <div class="flex flex-wrap items-end gap-3">
      <UFormField label="Total invite limit" hint="Blank = unlimited" class="flex-1 min-w-40">
        <UInput v-model="draft" type="number" min="0" placeholder="Unlimited" class="w-full" />
      </UFormField>
      <UButton label="Save" icon="i-lucide-save" :loading="saving" @click="save" />
    </div>
    <p class="text-xs text-muted mt-2">
      Caps the total number of people on the guest list. Admins are exempt.
    </p>
  </UCard>
</template>
