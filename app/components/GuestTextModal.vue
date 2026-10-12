<script setup lang="ts">
import type { EventInvite } from '#shared/types/event-invite'

// "Text {guest}" from the admin guest list: the host's own phone does the
// sending. The modal holds the guest's mobile number (editable, saved to their
// e-vite row) and a message pre-filled from the event's text template that the
// host can personalize, then "Open in Messages" is a plain `sms:` link — the
// Messages app opens pre-addressed and pre-filled, from the host's number, and
// nothing goes out until they tap send there. The parent owns the writes
// (useEventInvites.setPhone / markTexted).
const open = defineModel<boolean>('open', { default: false })
const props = defineProps<{
  invite: EventInvite | null
  /** The event's text template rendered for this guest (name, date, RSVP link). */
  defaultMessage: string
}>()
const emit = defineEmits<{
  savePhone: [phone: string | null]
  /** The host opened Messages: the number used (save it if new) and the text. */
  text: [phone: string, message: string]
}>()

const guestName = computed(() => props.invite?.display_name || props.invite?.email || '')
const phoneInput = ref('')
const message = ref('')

// Re-seed the fields each time a guest is opened, so edits never leak between people.
watch([() => props.invite?.id, open], () => {
  if (!open.value) return
  phoneInput.value = props.invite?.phone ? formatPhone(props.invite.phone) : ''
  message.value = props.defaultMessage
}, { immediate: true })

const normalized = computed(() => normalizePhone(phoneInput.value))
const phoneInvalid = computed(() => Boolean(phoneInput.value.trim()) && normalized.value === null)
const phoneChanged = computed(() => (normalized.value ?? null) !== (props.invite?.phone ?? null))
const canText = computed(() => Boolean(normalized.value) && message.value.trim().length > 0)
const href = computed(() => (normalized.value ? buildSmsHref([normalized.value], message.value.trim()) : undefined))

function onSavePhone(): void {
  if (phoneInvalid.value) return
  emit('savePhone', normalized.value)
}

function onText(): void {
  if (!normalized.value || !canText.value) return
  emit('text', normalized.value, message.value.trim())
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="invite ? `Text ${guestName}` : 'Text a guest'"
    :description="invite?.texted_at ? `Last texted ${formatDateTime(invite.texted_at)}` : 'From your own phone, so they know it\'s you.'"
  >
    <template #body>
      <div v-if="invite" class="space-y-4">
        <UFormField label="Mobile number" :error="phoneInvalid ? 'Not a valid number — use 10 digits for US, or +country code.' : undefined">
          <div class="flex gap-2">
            <UInput
              v-model="phoneInput"
              type="tel"
              placeholder="(555) 123-4567"
              aria-label="Mobile number"
              class="flex-1"
            />
            <UButton
              label="Save"
              color="neutral"
              variant="outline"
              :disabled="!phoneChanged || phoneInvalid"
              @click="onSavePhone"
            />
          </div>
        </UFormField>

        <UFormField label="Message" hint="edit freely — it's just for them">
          <UTextarea
            v-model="message"
            :rows="5"
            aria-label="Text message"
            class="w-full"
          />
        </UFormField>

        <p class="text-xs text-muted">
          Opens your Messages app with this filled in. Nothing is sent until you tap send there.
        </p>
      </div>
    </template>
    <template #footer>
      <div class="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 w-full">
        <UButton
          label="Done"
          color="neutral"
          variant="ghost"
          class="justify-center"
          @click="() => { open = false }"
        />
        <UButton
          label="Open in Messages"
          icon="i-lucide-message-circle"
          class="justify-center"
          :to="canText ? href : undefined"
          external
          :disabled="!canText"
          @click="onText"
        />
      </div>
    </template>
  </UModal>
</template>
