<script setup lang="ts">
import type { MovieEvent } from '#shared/types/event'
import type { EventGuest } from '#shared/types/event-invite'

// "Invite {person} to an event" from the People tab: pick an upcoming movie
// night, choose whether to email the e-vite right now, confirm. The guest-list
// insert + targeted send live in useInviteToEvent.
const open = defineModel<boolean>('open', { default: false })
const props = defineProps<{ guest: EventGuest | null, events: readonly MovieEvent[] }>()

const toast = useToast()
const { inviteToEvent } = useInviteToEvent()

const eventId = ref<string>()
const sendNow = ref(true)
const submitting = ref(false)

const eventOptions = computed(() =>
  props.events.map(event => ({
    label: `${formatDate(event.event_date, { dateStyle: 'medium' })} · ${event.title}`,
    value: event.id
  }))
)
const guestName = computed(() => props.guest?.display_name || props.guest?.email || '')

// Default to the soonest event each time the modal opens.
watch(open, (isOpen) => {
  if (isOpen) {
    eventId.value = props.events[0]?.id
    sendNow.value = true
  }
}, { immediate: true })

async function onConfirm(): Promise<void> {
  const guest = props.guest
  const id = eventId.value
  if (!guest || !id) return
  submitting.value = true
  try {
    const { added, sent, failed, error } = await inviteToEvent(id, guest, sendNow.value)
    if (failed) {
      toast.add({ title: `Added to the list, but the e-vite failed`, description: error ?? undefined, color: 'error' })
    } else if (sent) {
      toast.add({ title: `E-vite sent to ${guestName.value}`, icon: 'i-lucide-send', color: 'success' })
    } else if (added) {
      toast.add({ title: `${guestName.value} added to the guest list`, icon: 'i-lucide-check', color: 'success' })
    } else {
      toast.add({ title: `${guestName.value} is already on that guest list`, color: 'neutral' })
    }
    open.value = false
  } catch (err) {
    toast.add({ title: 'Could not invite them', description: err instanceof Error ? err.message : undefined, color: 'error' })
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="guest ? `Invite ${guestName} to an event` : 'Invite to an event'"
    :description="guest?.display_name ? guest.email : undefined"
  >
    <template #body>
      <div v-if="events.length" class="space-y-4">
        <UFormField label="Movie night" name="event">
          <USelectMenu
            v-model="eventId"
            :items="eventOptions"
            value-key="value"
            :search-input="false"
            aria-label="Movie night"
            class="w-full"
          />
        </UFormField>
        <USwitch v-model="sendNow" label="Email the e-vite now" description="Off just adds them to the guest list." />
      </div>
      <UAlert
        v-else
        color="neutral"
        variant="subtle"
        icon="i-lucide-calendar-off"
        title="No upcoming movie night"
        description="Add an event first, then invite people to it."
      />
    </template>
    <template #footer>
      <div class="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 w-full">
        <UButton label="Cancel" color="neutral" variant="ghost" class="justify-center" @click="open = false" />
        <UButton
          :label="sendNow ? 'Send e-vite' : 'Add to guest list'"
          :icon="sendNow ? 'i-lucide-send' : 'i-lucide-user-plus'"
          class="justify-center"
          :disabled="!events.length || !eventId"
          :loading="submitting"
          @click="onConfirm"
        />
      </div>
    </template>
  </UModal>
</template>
