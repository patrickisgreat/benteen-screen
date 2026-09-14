<script setup lang="ts">
import type { EventInvite } from '#shared/types/event-invite'
import type { RsvpStatus } from '#shared/types/rsvp'

// "RSVP for {guest}" from the admin guest list: the same Going / Maybe / Can't
// buttons and guest stepper a member sees in-app, applied on their behalf (for
// the person who told the host in person and will never open the e-vite). Each
// tap saves right away, like the in-app control; tapping the highlighted answer
// again clears their reply. "Email them" sends a confirmation of whatever is
// saved, with links to change it. Both writes live in the parent
// (useEventInvites.setRsvp / notifyRsvp).
const open = defineModel<boolean>('open', { default: false })
const props = withDefaults(defineProps<{
  invite: EventInvite | null
  counts: { going: number, maybe: number, no: number, guests?: number }
  /** True while the confirmation email is being sent. */
  notifying?: boolean
}>(), { notifying: false })
const emit = defineEmits<{ set: [status: RsvpStatus | null, plusOnes: number], notify: [] }>()

const guestName = computed(() => props.invite?.display_name || props.invite?.email || '')
const status = computed<RsvpStatus | null>(() => props.invite?.rsvp ?? null)
// Guests only count while going.
const plusOnes = computed(() => (status.value === 'going' ? props.invite?.plus_ones ?? 0 : 0))

function onSet(next: RsvpStatus): void {
  if (next === status.value) {
    emit('set', null, 0)
    return
  }
  emit('set', next, next === 'going' ? plusOnes.value : 0)
}

function onGuests(count: number): void {
  emit('set', 'going', count)
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="invite ? `RSVP for ${guestName}` : 'RSVP for a guest'"
    :description="invite?.display_name ? invite.email : undefined"
  >
    <template #body>
      <div
        v-if="invite"
        class="space-y-3"
      >
        <RsvpControl
          :my-status="status"
          :my-plus-ones="plusOnes"
          :counts="counts"
          @set="onSet"
          @guests="onGuests"
        />
        <p class="text-xs text-muted">
          Saves as you tap. Tap their highlighted answer again to clear it.
          "Email them" tells them what you recorded, with links to change it.
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
          @click="open = false"
        />
        <UButton
          label="Email them"
          icon="i-lucide-mail-check"
          color="neutral"
          variant="outline"
          class="justify-center"
          :disabled="!status"
          :loading="notifying"
          @click="emit('notify')"
        />
      </div>
    </template>
  </UModal>
</template>
