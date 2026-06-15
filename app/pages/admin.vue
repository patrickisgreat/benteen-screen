<script setup lang="ts">
import type { MovieEvent } from '#shared/types/event'

definePageMeta({ middleware: 'admin' })
useSeoMeta({ title: 'Admin · BSOTG' })

const toast = useToast()
const { events } = useEvents()
const { createEvent, updateEvent, deleteEvent } = useEventAdmin()

const modalOpen = ref(false)
const editingEvent = ref<MovieEvent | null>(null)
const eventPendingDelete = ref<MovieEvent | null>(null)

const selectedEventId = ref<string>()
const { suggestions, setDeleted, voterNames } = useAdminSuggestions(selectedEventId)

const eventOptions = computed(() =>
  events.value.map(event => ({
    label: `${formatDate(event.event_date, { dateStyle: 'medium' })} · ${event.title}`,
    value: event.id
  }))
)

// Default the moderation selector to the first event once data loads.
watch(events, (list) => {
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

async function onSave(payload: { id?: string, title: string, description: string, date: Date }): Promise<void> {
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

async function toggleSuggestion(id: string, deleted: boolean): Promise<void> {
  try {
    await setDeleted(id, deleted)
    toast.add({ title: deleted ? 'Suggestion hidden' : 'Suggestion restored', color: 'neutral' })
  } catch {
    toast.add({ title: 'Action failed', color: 'error' })
  }
}
</script>

<template>
  <UContainer class="py-8 max-w-4xl">
    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-8">
      <h1 class="text-3xl font-bold">
        Admin
      </h1>
      <UButton label="Add movie night" icon="i-lucide-plus" class="w-full sm:w-auto justify-center" @click="openCreate" />
    </div>

    <div class="grid gap-8 lg:grid-cols-2">
      <!-- Events -->
      <section>
        <h2 class="text-xl font-semibold mb-4">
          Events
        </h2>
        <div v-if="events.length" class="space-y-3">
          <UCard v-for="event in events" :key="event.id" variant="subtle">
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
      </section>

      <!-- Suggestion moderation -->
      <section>
        <h2 class="text-xl font-semibold mb-4">
          Suggestions
        </h2>

        <USelectMenu
          v-model="selectedEventId"
          :items="eventOptions"
          value-key="value"
          :search-input="false"
          placeholder="Select an event"
          class="w-full mb-4"
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
      </section>
    </div>

    <!-- Create / edit modal -->
    <EventFormModal v-model:open="modalOpen" :event="editingEvent" @save="onSave" />

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
