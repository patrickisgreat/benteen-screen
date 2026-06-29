<script setup lang="ts">
// Admin control for the RSVP-reminder checkpoints (app_settings.reminder_days):
// which days before an event to auto-email invitees who haven't replied. Blank
// disables reminders. RLS enforces admin-only writes.
const { reminderDays, setReminderDays } = useAppSettings()
const toast = useToast()
const draft = ref('')
const saving = ref(false)

watch(reminderDays, (v) => {
  draft.value = formatReminderDays(v)
}, { immediate: true })

async function save(): Promise<void> {
  saving.value = true
  try {
    const days = parseReminderDays(draft.value)
    await setReminderDays(days)
    draft.value = formatReminderDays(days)
    toast.add({
      title: days.length ? 'Reminder checkpoints saved' : 'Reminders turned off',
      icon: 'i-lucide-check',
      color: 'success'
    })
  } catch {
    toast.add({ title: 'Could not save the checkpoints', color: 'error' })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <UCard variant="subtle">
    <div class="flex flex-wrap items-end gap-3">
      <UFormField label="Reminder checkpoints (days before)" hint="e.g. 7, 3, 1 · blank = off" class="flex-1 min-w-48">
        <UInput v-model="draft" placeholder="7, 3, 1" class="w-full" />
      </UFormField>
      <UButton label="Save" icon="i-lucide-save" :loading="saving" @click="save" />
    </div>
    <p class="text-xs text-muted mt-2">
      Auto-emails invitees who haven't RSVP'd, on each of these days before an event. Each person stops once they reply. Leave blank to turn reminders off.
    </p>
  </UCard>
</template>
