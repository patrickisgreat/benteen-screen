<script setup lang="ts">
import type { MovieEvent } from '#shared/types/event'
import { RESCHEDULE_NOTE_MAX, RESCHEDULE_TIME_MAX, type RescheduleAudience } from '#shared/utils/reschedule'

// Move a movie night to a new date in one step: pick the date, see exactly who
// hears about it and what they'll read, confirm. RSVPs are kept — each person's
// email says where theirs stands and lets them change it with one tap. The
// preview is built by the same shared builder the server sends with.
const open = defineModel<boolean>('open', { default: false })
const props = withDefaults(defineProps<{ event?: MovieEvent | null, previewDebounceMs?: number }>(), { event: null, previewDebounceMs: 250 })
const emit = defineEmits<{ moved: [] }>()

const toast = useToast()
const { account } = useAuth()
const { rescheduleAudience, rescheduleEvent } = useEventAdmin()

const dateStr = ref('')
const startTime = ref('')
const note = ref('')
const notify = ref(true)
const saving = ref(false)
const audience = ref<RescheduleAudience | null>(null)
const audienceError = ref<string | null>(null)
const today = toInputDate(new Date())

// Hydrate each time it opens, and find out who a notice would reach.
watch(open, (isOpen) => {
  const ev = props.event
  if (!isOpen || !ev) return
  dateStr.value = toInputDate(toDate(ev.event_date) ?? new Date())
  startTime.value = ev.start_time ?? ''
  note.value = ''
  notify.value = true
  audience.value = null
  audienceError.value = null
  void loadAudience(ev.id)
})

async function loadAudience(eventId: string): Promise<void> {
  try {
    const result = await rescheduleAudience(eventId)
    if (props.event?.id === eventId) audience.value = result
  } catch (error) {
    audienceError.value = errorMessage(error, 'Could not count who would be emailed')
  }
}

/** The move as the server will receive it; null until there is a real date. */
const request = computed(() => {
  if (!dateStr.value) return null
  const date = new Date(`${dateStr.value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return null
  return {
    eventDate: date.toISOString(),
    startTime: startTime.value.trim() || null,
    note: note.value.trim() || null,
    notify: notify.value
  }
})
const changed = computed(() => Boolean(props.event && request.value && isRescheduled(props.event, request.value)))
// Emailing needs someone to email: with nobody e-vited yet, the move is silent.
const willEmail = computed(() => notify.value && (audience.value?.total ?? 0) > 0)

const currentWhen = computed(() => {
  const ev = props.event
  if (!ev) return ''
  return `${formatEmailDate(ev.event_date)}${ev.start_time ? ` · ${ev.start_time}` : ''}`
})
const newDateLabel = computed(() => (request.value ? formatEmailDate(request.value.eventDate) : ''))

const audienceSummary = computed(() => {
  const a = audience.value
  if (audienceError.value) return audienceError.value
  if (!a) return 'Counting who to tell…'
  if (!a.total) return 'No one has been e-vited or has RSVP\'d yet, so there is no one to email.'
  const parts = [
    a.going ? `${a.going} going` : '',
    a.maybe ? `${a.maybe} maybe` : '',
    a.declined ? `${a.declined} who declined` : '',
    a.noReply ? `${a.noReply} who haven't replied` : ''
  ].filter(Boolean)
  return `${a.total} ${a.total === 1 ? 'person' : 'people'} will be emailed: ${parts.join(', ')}.`
})

const preview = computed(() => {
  const ev = props.event
  if (!ev || !request.value || !changed.value || !willEmail.value) return null
  const sample = audience.value?.sample
  return buildDateChangeEmail({
    eventTitle: ev.title,
    oldDate: formatEmailDate(ev.event_date) || null,
    newDate: newDateLabel.value,
    newTime: request.value.startTime,
    hostName: account.value?.displayName ?? null,
    recipientName: sample?.name,
    note: request.value.note,
    rsvp: sample?.rsvp && isRsvpStatus(sample.rsvp) ? sample.rsvp : null,
    // Real copies carry each guest's own links; the preview's go nowhere.
    rsvpUrl: '#',
    appUrl: '#'
  })
})
const previewHtml = useDebouncedValue(() => preview.value?.html ?? '', props.previewDebounceMs)

const confirmLabel = computed(() => {
  if (!changed.value) return 'Pick a new date'
  return willEmail.value ? `Move it and email ${audience.value?.total}` : 'Move it without emailing'
})

async function submit(): Promise<void> {
  const ev = props.event
  if (!ev || !request.value || !changed.value) return
  saving.value = true
  try {
    const { sent, failed, error } = await rescheduleEvent(ev.id, request.value)
    if (!request.value.notify || (!sent && !failed)) {
      toast.add({ title: `Moved to ${newDateLabel.value}`, icon: 'i-lucide-calendar-check', color: 'success' })
    } else if (sent && !failed) {
      toast.add({ title: `Moved to ${newDateLabel.value}`, description: `${sent} ${sent === 1 ? 'person' : 'people'} emailed.`, icon: 'i-lucide-calendar-check', color: 'success' })
    } else if (sent) {
      toast.add({ title: `Moved, but ${failed} of the emails failed`, description: error ?? undefined, color: 'warning' })
    } else {
      // The date did move; nobody was told. Say so plainly so the admin follows up.
      toast.add({ title: 'The date moved, but the email could not be sent', description: `${error ?? 'Unknown error'} — send an announcement from Comms to let people know.`, color: 'error' })
    }
    emit('moved')
    open.value = false
  } catch (error) {
    toast.add({ title: 'Could not move the event', description: errorMessage(error), color: 'error' })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    title="Move the date"
    :description="event ? `${event.title} — currently ${currentWhen}` : undefined"
  >
    <template #body>
      <div class="space-y-4">
        <div class="grid sm:grid-cols-2 gap-4">
          <UFormField
            label="New date"
            required
          >
            <UInput
              v-model="dateStr"
              type="date"
              :min="today"
              class="w-full"
            />
          </UFormField>
          <UFormField
            label="Start time"
            hint="optional"
          >
            <UInput
              v-model="startTime"
              :maxlength="RESCHEDULE_TIME_MAX"
              placeholder="e.g. 7:30 PM"
              class="w-full"
            />
          </UFormField>
        </div>

        <UAlert
          color="neutral"
          variant="subtle"
          icon="i-lucide-users"
          title="RSVPs stay as they are"
          description="Nobody is un-RSVP'd. Each person's email says where they stand and has one-tap buttons to change it if the new date doesn't work."
        />

        <USwitch
          v-model="notify"
          label="Email everyone about the change"
          :description="notify ? audienceSummary : 'The date changes quietly. Nobody is told.'"
        />

        <template v-if="notify">
          <UFormField
            label="Note to guests"
            hint="optional"
          >
            <UTextarea
              v-model="note"
              :rows="2"
              :maxlength="RESCHEDULE_NOTE_MAX"
              placeholder="Rain is forecast for Friday, so we're moving to Saturday."
              class="w-full"
            />
          </UFormField>

          <div
            v-if="preview"
            class="space-y-1.5"
            data-testid="date-change-preview"
          >
            <p class="text-sm font-semibold">
              Preview
            </p>
            <p class="text-sm text-muted break-words">
              <span class="font-medium">Subject:</span> {{ preview.subject }}
            </p>
            <iframe
              :srcdoc="previewHtml"
              title="Date change email preview"
              sandbox=""
              class="w-full h-80 rounded-lg ring ring-default bg-white"
            />
            <p class="text-xs text-muted">
              Each person's copy is addressed to them and reflects their own RSVP.
            </p>
          </div>
        </template>
      </div>
    </template>

    <template #footer>
      <div class="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 w-full">
        <UButton
          label="Cancel"
          color="neutral"
          variant="ghost"
          class="justify-center"
          @click="() => { open = false }"
        />
        <UButton
          :label="confirmLabel"
          icon="i-lucide-calendar-clock"
          class="justify-center"
          :loading="saving"
          :disabled="!changed"
          @click="submit"
        />
      </div>
    </template>
  </UModal>
</template>
