<script setup lang="ts">
import type { MovieEvent } from '#shared/types/event'
import type { CalendarEvent } from '#shared/utils/calendar'
import type { BringItem } from '#shared/types/bring'

const open = defineModel<boolean>('open', { default: false })
const props = defineProps<{ event: MovieEvent | null }>()

const eventId = computed(() => props.event?.id ?? null)
const { myStatus, myPlusOnes, counts, setStatus, setGuests } = useRsvp(eventId)
// The merged "who's coming" roster (in-app + e-vite email replies). Members see
// fellow members; admins also see email-only guests (event_invites is admin-only).
const { roster } = useEventRsvps(eventId)
const { items, addItem, claim, unclaim, remove } = useBringList(eventId)
const { run } = useToastAction()
const toast = useToast()

// Members add items they're bringing themselves (claimSelf), unlike the admin
// tab which curates open slots. Removal is limited in the UI (and by RLS) to
// items you added.
async function onAddBring(label: string): Promise<void> {
  if (await run(() => addItem(label), 'Could not add your item')) {
    toast.add({ title: 'Added to the bring list', icon: 'i-lucide-check', color: 'success' })
  }
}
async function onRemoveBring(item: BringItem): Promise<void> {
  await run(() => remove(item), 'Could not remove the item')
}
async function onClaim(item: BringItem): Promise<void> {
  await run(() => claim(item), 'Could not claim the item')
}
async function onUnclaim(item: BringItem): Promise<void> {
  await run(() => unclaim(item), 'Could not unclaim the item')
}

const calEvent = computed<CalendarEvent | null>(() => {
  const e = props.event
  if (!e) return null
  const base = toDate(e.event_date)
  if (!base) return null
  return {
    title: e.title,
    start: applyTime(base, e.start_time),
    location: e.location,
    description: e.description
  }
})
const googleUrl = computed(() => (calEvent.value ? googleCalendarUrl(calEvent.value) : '#'))

function downloadIcs(): void {
  if (!calEvent.value) return
  downloadTextFile(icsContent(calEvent.value), icsFilename(props.event?.title), 'text/calendar;charset=utf-8')
}
</script>

<template>
  <UModal v-model:open="open" :title="event?.title || 'Event'" :ui="{ content: 'sm:max-w-2xl' }">
    <template #body>
      <div v-if="event" class="space-y-5">
        <!-- Poster banner -->
        <img
          v-if="event.poster_url"
          :src="event.poster_url"
          :alt="`${event.title} poster`"
          class="w-full max-h-96 object-contain rounded-lg ring ring-default bg-black"
        >

        <!-- Date / status / logistics -->
        <div class="space-y-2">
          <div class="flex flex-wrap items-center gap-2">
            <UBadge
              :color="isUpcoming(event.event_date) ? 'primary' : 'neutral'"
              :variant="isUpcoming(event.event_date) ? 'solid' : 'subtle'"
              :label="isUpcoming(event.event_date) ? 'Upcoming' : 'Past'"
              icon="i-lucide-calendar"
            />
            <span class="text-muted">{{ formatDate(event.event_date) }}</span>
            <span v-if="event.start_time" class="text-muted inline-flex items-center gap-1">
              <UIcon name="i-lucide-clock" /> {{ event.start_time }}
            </span>
          </div>
          <p v-if="event.location" class="text-muted inline-flex items-center gap-1.5">
            <UIcon name="i-lucide-map-pin" class="shrink-0" />
            <a
              v-if="event.location_url"
              :href="event.location_url"
              target="_blank"
              rel="noopener"
              class="text-primary underline"
            >{{ event.location }}</a>
            <span v-else>{{ event.location }}</span>
          </p>
          <WeatherForecast
            v-if="isUpcoming(event.event_date) && event.location"
            :location="event.location"
            :date="event.event_date"
          />
        </div>

        <!-- Add to calendar -->
        <div v-if="isUpcoming(event.event_date)" class="flex flex-wrap gap-2">
          <UButton
            label="Google Calendar"
            icon="i-lucide-calendar-plus"
            color="neutral"
            variant="outline"
            size="sm"
            :to="googleUrl"
            target="_blank"
          />
          <UButton
            label="Apple / .ics"
            icon="i-lucide-download"
            color="neutral"
            variant="outline"
            size="sm"
            @click="downloadIcs"
          />
        </div>

        <!-- Share to invite others (access stays allowlist-gated) -->
        <div v-if="isUpcoming(event.event_date)">
          <h3 class="text-sm font-semibold text-muted mb-2">
            Spread the word
          </h3>
          <ShareEvent :event="event" />
        </div>

        <!-- Description -->
        <div
          v-if="event.description"
          class="text-muted [&_p]:my-2 [&_a]:text-primary [&_a]:underline [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5"
          v-html="sanitizeHtml(event.description)"
        />

        <USeparator />

        <!-- RSVP -->
        <div>
          <h3 class="text-sm font-semibold text-muted mb-2">
            Are you coming?
          </h3>
          <RsvpControl
            :my-status="myStatus"
            :my-plus-ones="myPlusOnes"
            :counts="counts"
            @set="setStatus"
            @guests="setGuests"
          />
        </div>

        <!-- Who's coming (merged in-app + e-vite RSVPs) -->
        <div>
          <h3 class="text-sm font-semibold text-muted mb-2">
            Who's coming
          </h3>
          <RsvpRoster :roster="roster" />
        </div>

        <USeparator />

        <!-- Bring list -->
        <div>
          <h3 class="text-sm font-semibold text-muted mb-2">
            Bring list
          </h3>
          <BringList
            :items="items"
            @add="onAddBring"
            @claim="onClaim"
            @unclaim="onUnclaim"
            @remove="onRemoveBring"
          />
        </div>
      </div>
    </template>
  </UModal>
</template>
