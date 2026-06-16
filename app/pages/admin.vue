<script setup lang="ts">
import type { MovieEvent } from '#shared/types/event'
import type { BringItem } from '#shared/types/bring'
import type { Profile } from '#shared/types/user'
import type { Invite } from '#shared/types/invite'

definePageMeta({ middleware: 'admin' })
useSeoMeta({ title: 'Admin · BSOTG' })

const toast = useToast()
const { events } = useEvents()
const { createEvent, updateEvent, deleteEvent } = useEventAdmin()
const { people, pendingInvites, loadError, setBlocked, revokeInvite } = useAdminPeople()

const modalOpen = ref(false)
const inviteOpen = ref(false)
const editingEvent = ref<MovieEvent | null>(null)
const eventPendingDelete = ref<MovieEvent | null>(null)

const selectedEventId = ref<string>()
const { suggestions, setDeleted, voterNames } = useAdminSuggestions(selectedEventId)

// Bring list + headcount for the selected event (admins curate; people claim on the event page).
const { items: bringItems, addItem: addBringItem, remove: removeBringItem } = useBringList(selectedEventId)
const { counts: rsvpCounts } = useRsvp(selectedEventId)

// Upcoming events first (soonest first), then past events descending (oldest last).
const sortedEvents = computed(() => sortEventsForAdmin(events.value))
const selectedEvent = computed(() => sortedEvents.value.find(e => e.id === selectedEventId.value) ?? null)

const eventOptions = computed(() =>
  sortedEvents.value.map(event => ({
    label: `${formatDate(event.event_date, { dateStyle: 'medium' })} · ${event.title}`,
    value: event.id
  }))
)

const tabs = [
  { label: 'Overview', icon: 'i-lucide-layout-dashboard', slot: 'overview' },
  { label: 'Events', icon: 'i-lucide-calendar', slot: 'events' },
  { label: 'People', icon: 'i-lucide-users', slot: 'people' },
  { label: 'Suggestions', icon: 'i-lucide-clapperboard', slot: 'suggestions' },
  { label: 'Bring list', icon: 'i-lucide-utensils', slot: 'bring' },
  { label: 'Invites', icon: 'i-lucide-mail-plus', slot: 'invites' },
  { label: 'Comms', icon: 'i-lucide-megaphone', slot: 'comms' }
]

// --- Overview stats (for the focused event) ---
const memberCount = computed(() => people.value.length)
const blockedCount = computed(() => people.value.filter(p => p.blocked).length)
const liveSuggestions = computed(() => suggestions.value.filter(s => !s.deleted))
const selectedVoteCount = computed(() => liveSuggestions.value.reduce((n, s) => n + (s.votes?.length ?? 0), 0))
const submitterIds = computed(() => new Set(liveSuggestions.value.map(s => s.user_id)))
const yetToSubmit = computed(() => people.value.filter(p => !p.blocked && !submitterIds.value.has(p.id)))
const YET_PREVIEW = 12
const yetToSubmitPreview = computed(() => yetToSubmit.value.slice(0, YET_PREVIEW))
const yetToSubmitMore = computed(() => Math.max(0, yetToSubmit.value.length - YET_PREVIEW))

// Default the focused event to the next upcoming one once data loads.
watch(sortedEvents, (list) => {
  if (!selectedEventId.value && list.length) selectedEventId.value = list[0]!.id
}, { immediate: true })

function openCreate(): void {
  editingEvent.value = null
  modalOpen.value = true
}
function openEdit(event: MovieEvent): void {
  editingEvent.value = event
  modalOpen.value = true
}

async function onSave(payload: {
  id?: string
  title: string
  description: string
  date: Date
  startTime: string | null
  location: string | null
  locationUrl: string | null
  posterUrl: string | null
}): Promise<void> {
  try {
    if (payload.id) {
      await updateEvent(payload.id, payload)
      toast.add({ title: 'Event updated', icon: 'i-lucide-check', color: 'success' })
    } else {
      await createEvent(payload)
      toast.add({ title: 'Event created', icon: 'i-lucide-check', color: 'success' })
    }
  } catch {
    toast.add({ title: 'Could not save event', color: 'error' })
  }
}

async function confirmDelete(): Promise<void> {
  const event = eventPendingDelete.value
  if (!event) return
  try {
    await deleteEvent(event.id)
    toast.add({ title: 'Event deleted', color: 'neutral' })
    if (selectedEventId.value === event.id) selectedEventId.value = undefined
  } catch {
    toast.add({ title: 'Could not delete event', color: 'error' })
  } finally {
    eventPendingDelete.value = null
  }
}

async function onAddBring(label: string): Promise<void> {
  try {
    await addBringItem(label, undefined, false) // open slot anyone can claim
    toast.add({ title: 'Added to bring list', icon: 'i-lucide-check', color: 'success' })
  } catch {
    toast.add({ title: 'Could not add item', color: 'error' })
  }
}

async function onRemoveBring(item: BringItem): Promise<void> {
  try {
    await removeBringItem(item)
    toast.add({ title: 'Item removed', color: 'neutral' })
  } catch {
    toast.add({ title: 'Could not remove item', color: 'error' })
  }
}

async function toggleSuggestion(id: string, deleted: boolean): Promise<void> {
  try {
    await setDeleted(id, deleted)
    toast.add({ title: deleted ? 'Suggestion hidden' : 'Suggestion restored', color: 'neutral' })
  } catch {
    toast.add({ title: 'Action failed', color: 'error' })
  }
}

async function onBlock(person: Profile): Promise<void> {
  try {
    await setBlocked(person.id, true)
    toast.add({ title: `${person.display_name ?? 'User'} banned`, color: 'neutral' })
  } catch {
    toast.add({ title: 'Could not ban user', color: 'error' })
  }
}
async function onUnblock(person: Profile): Promise<void> {
  try {
    await setBlocked(person.id, false)
    toast.add({ title: `${person.display_name ?? 'User'} unbanned`, icon: 'i-lucide-check', color: 'success' })
  } catch {
    toast.add({ title: 'Could not unban user', color: 'error' })
  }
}
async function onRevoke(invite: Invite): Promise<void> {
  try {
    await revokeInvite(invite.email)
    toast.add({ title: `Invite to ${invite.email} revoked`, color: 'neutral' })
  } catch {
    toast.add({ title: 'Could not revoke invite', color: 'error' })
  }
}
</script>

<template>
  <UContainer class="py-8 max-w-4xl">
    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
      <h1 class="text-3xl font-bold">
        Admin
      </h1>
      <UButton label="Add movie night" icon="i-lucide-plus" class="w-full sm:w-auto justify-center" @click="openCreate" />
    </div>

    <UTabs :items="tabs" class="w-full" :ui="{ content: 'pt-6' }">
      <!-- OVERVIEW -->
      <template #overview>
        <div class="space-y-6">
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <UCard variant="subtle" :ui="{ body: 'text-center' }">
              <p class="text-2xl font-bold">
                {{ memberCount }}
              </p>
              <p class="text-xs text-muted">
                members
              </p>
            </UCard>
            <UCard variant="subtle" :ui="{ body: 'text-center' }">
              <p class="text-2xl font-bold">
                {{ events.length }}
              </p>
              <p class="text-xs text-muted">
                events
              </p>
            </UCard>
            <UCard variant="subtle" :ui="{ body: 'text-center' }">
              <p class="text-2xl font-bold">
                {{ rsvpCounts.going }}
              </p>
              <p class="text-xs text-muted">
                going (next)
              </p>
            </UCard>
            <UCard variant="subtle" :ui="{ body: 'text-center' }">
              <p class="text-2xl font-bold" :class="blockedCount ? 'text-error' : ''">
                {{ blockedCount }}
              </p>
              <p class="text-xs text-muted">
                blocked
              </p>
            </UCard>
          </div>

          <UCard v-if="selectedEvent" variant="subtle">
            <div class="flex flex-wrap items-center justify-between gap-2 mb-3">
              <h3 class="font-semibold">
                {{ selectedEvent.title }}
              </h3>
              <span class="text-sm text-muted">{{ formatDate(selectedEvent.event_date) }}</span>
            </div>
            <div class="flex flex-wrap gap-4 text-sm">
              <span><strong>{{ liveSuggestions.length }}</strong> <span class="text-muted">suggestions</span></span>
              <span><strong>{{ selectedVoteCount }}</strong> <span class="text-muted">votes</span></span>
              <span><strong>{{ rsvpCounts.going }}</strong> <span class="text-muted">going</span></span>
              <span><strong>{{ yetToSubmit.length }}</strong> <span class="text-muted">yet to suggest</span></span>
            </div>
            <template v-if="yetToSubmit.length">
              <USeparator class="my-3" />
              <p class="text-xs text-muted mb-2">
                Haven't suggested yet
              </p>
              <div class="flex flex-wrap gap-1">
                <UBadge
                  v-for="p in yetToSubmitPreview"
                  :key="p.id"
                  :label="p.display_name ?? p.email ?? 'Unknown'"
                  color="neutral"
                  variant="outline"
                  size="xs"
                />
                <UBadge v-if="yetToSubmitMore" :label="`+${yetToSubmitMore} more`" color="neutral" variant="subtle" size="xs" />
              </div>
            </template>
          </UCard>
        </div>
      </template>

      <!-- EVENTS -->
      <template #events>
        <div v-if="sortedEvents.length" class="space-y-3">
          <UCard v-for="event in sortedEvents" :key="event.id" variant="subtle">
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <p class="text-sm text-muted">
                  {{ formatDate(event.event_date) }}
                  <UBadge
                    v-if="isUpcoming(event.event_date)"
                    label="Upcoming"
                    color="primary"
                    variant="subtle"
                    size="xs"
                    class="ml-1"
                  />
                </p>
                <h3 class="font-semibold truncate">
                  {{ event.title }}
                </h3>
              </div>
              <div class="flex gap-1 shrink-0">
                <UButton
                  icon="i-lucide-pencil"
                  color="neutral"
                  variant="ghost"
                  size="sm"
                  aria-label="Edit event"
                  @click="openEdit(event)"
                />
                <UButton
                  icon="i-lucide-trash-2"
                  color="error"
                  variant="ghost"
                  size="sm"
                  aria-label="Delete event"
                  @click="eventPendingDelete = event"
                />
              </div>
            </div>
          </UCard>
        </div>
        <UCard v-else variant="subtle" class="text-center text-muted">
          No events yet. Add your first movie night.
        </UCard>
      </template>

      <!-- PEOPLE -->
      <template #people>
        <div class="space-y-5">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <p class="text-sm text-muted">
              {{ people.length }} member{{ people.length === 1 ? '' : 's' }}
              <template v-if="pendingInvites.length">
                · {{ pendingInvites.length }} pending
              </template>
            </p>
            <UButton label="Invite someone" icon="i-lucide-user-plus" size="sm" @click="inviteOpen = true" />
          </div>

          <InviteLimitSetting />

          <UAlert
            v-if="loadError"
            color="error"
            variant="subtle"
            icon="i-lucide-circle-alert"
            title="Couldn't load the directory"
            :description="loadError"
          />

          <PeopleList
            :people="people"
            :pending="pendingInvites"
            @block="onBlock"
            @unblock="onUnblock"
            @revoke="onRevoke"
          />
        </div>
      </template>

      <!-- SUGGESTIONS -->
      <template #suggestions>
        <USelectMenu
          v-model="selectedEventId"
          :items="eventOptions"
          value-key="value"
          :search-input="false"
          placeholder="Select an event"
          class="w-full sm:max-w-sm mb-4"
        />

        <div v-if="suggestions.length" class="space-y-3">
          <UCard
            v-for="suggestion in suggestions"
            :key="suggestion.id"
            variant="subtle"
            :class="suggestion.deleted ? 'opacity-60' : ''"
          >
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <h3 class="font-semibold">
                  {{ suggestion.tmdb_movie.title }}
                  <UBadge v-if="suggestion.deleted" label="Hidden" color="neutral" variant="subtle" size="xs" />
                </h3>
                <p class="text-sm text-muted truncate">
                  by {{ suggestion.author?.email || 'unknown' }}
                </p>
                <p class="text-sm mt-1">
                  <UIcon name="i-lucide-heart" class="text-error align-text-bottom" />
                  {{ suggestion.votes?.length ?? 0 }} votes
                </p>
                <div v-if="voterNames(suggestion).length" class="flex flex-wrap gap-1 mt-2">
                  <UBadge
                    v-for="(name, i) in voterNames(suggestion)"
                    :key="`${suggestion.id}-${i}`"
                    :label="name"
                    color="neutral"
                    variant="outline"
                    size="xs"
                  />
                </div>
              </div>
              <UButton
                v-if="suggestion.deleted"
                label="Restore"
                icon="i-lucide-rotate-ccw"
                color="neutral"
                variant="outline"
                size="sm"
                class="shrink-0"
                @click="toggleSuggestion(suggestion.id, false)"
              />
              <UButton
                v-else
                label="Hide"
                icon="i-lucide-eye-off"
                color="error"
                variant="outline"
                size="sm"
                class="shrink-0"
                @click="toggleSuggestion(suggestion.id, true)"
              />
            </div>
          </UCard>
        </div>
        <UCard v-else variant="subtle" class="text-center text-muted">
          No suggestions for this event.
        </UCard>
      </template>

      <!-- BRING LIST -->
      <template #bring>
        <p class="text-sm text-muted mb-4">
          Add what the group needs for this event — people claim items on the event page.
        </p>
        <USelectMenu
          v-model="selectedEventId"
          :items="eventOptions"
          value-key="value"
          :search-input="false"
          placeholder="Select an event"
          class="w-full sm:max-w-sm mb-4"
        />

        <div v-if="selectedEventId" class="max-w-xl">
          <BringList
            :items="bringItems"
            manage
            @add="onAddBring"
            @remove="onRemoveBring"
          />
        </div>
        <UCard v-else variant="subtle" class="text-center text-muted">
          Select an event to manage its bring list.
        </UCard>
      </template>

      <!-- COMMS -->
      <template #invites>
        <p class="text-sm text-muted mb-4">
          Curate the guest list for an event and send Evite-style invitations with
          one-click RSVP. A new event's list auto-fills from the last movie night.
        </p>
        <USelectMenu
          v-model="selectedEventId"
          :items="eventOptions"
          value-key="value"
          :search-input="false"
          placeholder="Select an event"
          class="w-full sm:max-w-sm mb-4"
        />
        <EventInviteManager v-if="selectedEventId" :key="selectedEventId" :event-id="selectedEventId" />
        <UCard v-else variant="subtle" class="text-center text-muted">
          Select an event to manage its guest list.
        </UCard>
      </template>

      <template #comms>
        <p class="text-sm text-muted mb-4">
          Email an announcement or reminder about an event. Recipients are BCC'd.
        </p>
        <USelectMenu
          v-model="selectedEventId"
          :items="eventOptions"
          value-key="value"
          :search-input="false"
          placeholder="Select an event"
          class="w-full sm:max-w-sm mb-4"
        />
        <EventAnnounceComposer v-if="selectedEventId" :event-id="selectedEventId" class="max-w-xl" />
        <UCard v-else variant="subtle" class="text-center text-muted">
          Select an event to send a blast.
        </UCard>
      </template>
    </UTabs>

    <!-- Create / edit modal -->
    <EventFormModal v-model:open="modalOpen" :event="editingEvent" @save="onSave" />

    <!-- Admin invite a friend -->
    <InviteFriendModal v-model:open="inviteOpen" />

    <!-- Delete confirmation -->
    <UModal
      :open="Boolean(eventPendingDelete)"
      title="Delete event?"
      :description="`This permanently deletes “${eventPendingDelete?.title}” and cannot be undone.`"
      @update:open="(value) => { if (!value) eventPendingDelete = null }"
    >
      <template #footer>
        <div class="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 w-full">
          <UButton label="Cancel" color="neutral" variant="ghost" class="justify-center" @click="eventPendingDelete = null" />
          <UButton label="Delete" color="error" icon="i-lucide-trash-2" class="justify-center" @click="confirmDelete" />
        </div>
      </template>
    </UModal>
  </UContainer>
</template>
