<script setup lang="ts">
import { z } from 'zod'
import type { EventInvite } from '#shared/types/event-invite'

// Admin guest-list manager + Evite tracker for one event. Lets admins add/remove
// guests, pull last event's list in on demand, send tokenized e-vites, and shows
// live RSVP / open / click tracking.
const props = defineProps<{ eventId: string }>()
const toast = useToast()
const { invites, stats, addInvite, removeInvite, removeInvites, seedFromLastEvent, sendInvites } = useEventInvites(() => props.eventId)

const newEmail = ref('')
const newName = ref('')
const sending = ref(false)
const seeding = ref(false)
const deleting = ref(false)
const emailSchema = z.string().email()

// Multi-select for bulk delete. Kept in sync as the list changes (realtime / refresh).
const selected = ref<Set<string>>(new Set())
const selectedCount = computed(() => selected.value.size)
const allSelected = computed(() => invites.value.length > 0 && invites.value.every(i => selected.value.has(i.id)))

watch(invites, (list) => {
  const live = new Set(list.map(i => i.id))
  const next = new Set([...selected.value].filter(id => live.has(id)))
  if (next.size !== selected.value.size) selected.value = next
})

function toggleOne(id: string): void {
  const next = new Set(selected.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selected.value = next
}
function toggleAll(): void {
  selected.value = allSelected.value ? new Set() : new Set(invites.value.map(i => i.id))
}
async function onDeleteSelected(): Promise<void> {
  const ids = [...selected.value]
  if (!ids.length) return
  deleting.value = true
  try {
    await removeInvites(ids)
    selected.value = new Set()
    toast.add({ title: `Removed ${ids.length} guest${ids.length === 1 ? '' : 's'}`, color: 'neutral' })
  } catch {
    toast.add({ title: 'Could not remove the selected guests', color: 'error' })
  } finally {
    deleting.value = false
  }
}

async function onAdd(): Promise<void> {
  const email = newEmail.value.trim()
  if (!emailSchema.safeParse(email).success) {
    toast.add({ title: 'Enter a valid email', color: 'warning' })
    return
  }
  try {
    await addInvite(email, newName.value.trim() || undefined)
    newEmail.value = ''
    newName.value = ''
  } catch {
    toast.add({ title: 'Could not add them', color: 'error' })
  }
}

async function onRemove(invite: EventInvite): Promise<void> {
  try {
    await removeInvite(invite.id)
  } catch {
    toast.add({ title: 'Could not remove them', color: 'error' })
  }
}

async function onSeed(): Promise<void> {
  seeding.value = true
  try {
    const n = await seedFromLastEvent()
    toast.add({ title: n ? `Added ${n} from the last event` : 'Nothing new to pull in', color: 'neutral' })
  } catch {
    toast.add({ title: 'Could not pull the last list', color: 'error' })
  } finally {
    seeding.value = false
  }
}

async function onSend(): Promise<void> {
  sending.value = true
  try {
    const { sent, failed, error } = await sendInvites()
    if (sent && failed) {
      toast.add({ title: `Sent ${sent}, ${failed} failed`, description: error ?? undefined, icon: 'i-lucide-send', color: 'warning' })
    } else if (sent) {
      toast.add({ title: `Sent ${sent} invite${sent === 1 ? '' : 's'}`, icon: 'i-lucide-send', color: 'success' })
    } else if (failed) {
      // The send reached Resend but was rejected — show the reason, don't pretend success.
      toast.add({ title: `Couldn't send ${failed} invite${failed === 1 ? '' : 's'}`, description: error ?? undefined, color: 'error' })
    } else {
      toast.add({ title: 'Everyone has already been invited', color: 'neutral' })
    }
  } catch (error) {
    toast.add({ title: 'Could not send invites', description: error instanceof Error ? error.message : undefined, color: 'error' })
  } finally {
    sending.value = false
  }
}

const unsent = computed(() => invites.value.filter(i => !i.sent_at).length)

function statusBadge(invite: EventInvite): { label: string, color: 'success' | 'warning' | 'neutral' | 'info' } {
  if (invite.rsvp === 'going') return { label: 'Going', color: 'success' }
  if (invite.rsvp === 'maybe') return { label: 'Maybe', color: 'warning' }
  if (invite.rsvp === 'no') return { label: 'Can\'t make it', color: 'neutral' }
  if (invite.clicked_at) return { label: 'Clicked', color: 'info' }
  if (invite.opened_at) return { label: 'Opened', color: 'info' }
  if (invite.sent_at) return { label: 'Sent', color: 'neutral' }
  return { label: 'Not sent', color: 'neutral' }
}
</script>

<template>
  <div class="space-y-5">
    <!-- Tracker -->
    <div class="grid grid-cols-3 sm:grid-cols-6 gap-2 text-center">
      <UCard variant="subtle" :ui="{ body: 'p-3' }">
        <p class="text-xl font-bold">
          {{ stats.invited }}
        </p>
        <p class="text-xs text-muted">
          invited
        </p>
      </UCard>
      <UCard variant="subtle" :ui="{ body: 'p-3' }">
        <p class="text-xl font-bold">
          {{ stats.opened }}
        </p>
        <p class="text-xs text-muted">
          opened
        </p>
      </UCard>
      <UCard variant="subtle" :ui="{ body: 'p-3' }">
        <p class="text-xl font-bold text-success">
          {{ stats.going }}
        </p>
        <p class="text-xs text-muted">
          going
        </p>
      </UCard>
      <UCard variant="subtle" :ui="{ body: 'p-3' }">
        <p class="text-xl font-bold text-warning">
          {{ stats.maybe }}
        </p>
        <p class="text-xs text-muted">
          maybe
        </p>
      </UCard>
      <UCard variant="subtle" :ui="{ body: 'p-3' }">
        <p class="text-xl font-bold">
          {{ stats.no }}
        </p>
        <p class="text-xs text-muted">
          can't
        </p>
      </UCard>
      <UCard variant="subtle" :ui="{ body: 'p-3' }">
        <p class="text-xl font-bold text-muted">
          {{ stats.noReply }}
        </p>
        <p class="text-xs text-muted">
          no reply
        </p>
      </UCard>
    </div>

    <!-- Add + actions -->
    <div class="flex flex-wrap items-end gap-2">
      <UFormField label="Add guest email" class="flex-1 min-w-48">
        <UInput v-model="newEmail" type="email" placeholder="friend@example.com" class="w-full" @keydown.enter="onAdd" />
      </UFormField>
      <UFormField label="Name" hint="optional" class="min-w-32">
        <UInput v-model="newName" placeholder="Jordan" class="w-full" @keydown.enter="onAdd" />
      </UFormField>
      <UButton label="Add" icon="i-lucide-plus" @click="onAdd" />
    </div>
    <div class="flex flex-wrap items-center gap-2">
      <UButton label="Pull from last event" icon="i-lucide-history" color="neutral" variant="outline" size="sm" :loading="seeding" @click="onSeed" />
      <UButton
        :label="unsent ? `Send ${unsent} invite${unsent === 1 ? '' : 's'}` : 'All invites sent'"
        icon="i-lucide-send"
        size="sm"
        :loading="sending"
        :disabled="!unsent"
        @click="onSend"
      />
    </div>

    <!-- Bulk select toolbar -->
    <div v-if="invites.length" class="flex items-center gap-3 px-1">
      <UCheckbox
        :model-value="allSelected"
        aria-label="Select all guests"
        @update:model-value="toggleAll"
      />
      <span class="text-sm text-muted">
        {{ selectedCount ? `${selectedCount} selected` : 'Select all' }}
      </span>
      <UButton
        v-if="selectedCount"
        :label="`Delete ${selectedCount}`"
        icon="i-lucide-trash-2"
        color="error"
        variant="soft"
        size="xs"
        class="ml-auto"
        :loading="deleting"
        @click="onDeleteSelected"
      />
    </div>

    <!-- Guest list -->
    <ul v-if="invites.length" class="divide-y divide-default rounded-lg ring ring-default overflow-hidden">
      <li v-for="invite in invites" :key="invite.id" class="flex items-center gap-3 p-3">
        <UCheckbox
          :model-value="selected.has(invite.id)"
          :aria-label="`Select ${invite.display_name || invite.email}`"
          class="shrink-0"
          @update:model-value="toggleOne(invite.id)"
        />
        <div class="min-w-0 flex-1">
          <p class="font-medium truncate">
            {{ invite.display_name || invite.email }}
          </p>
          <p v-if="invite.display_name" class="text-xs text-muted truncate">
            {{ invite.email }}
          </p>
        </div>
        <UBadge :label="statusBadge(invite).label" :color="statusBadge(invite).color" variant="subtle" size="sm" class="shrink-0" />
        <UButton
          icon="i-lucide-x"
          color="neutral"
          variant="ghost"
          size="xs"
          aria-label="Remove guest"
          class="shrink-0"
          @click="onRemove(invite)"
        />
      </li>
    </ul>
    <p v-else class="text-sm text-muted">
      No guests yet — add emails above, or pull in last event's list.
    </p>
  </div>
</template>
