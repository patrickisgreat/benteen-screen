<script setup lang="ts">
import { z } from 'zod'
import type { EventInvite } from '#shared/types/event-invite'

// Admin guest-list manager + Evite tracker for one event. Auto-rolls the list
// forward from the previous event, lets admins add/remove, sends tokenized
// e-vites, and shows live RSVP / open / click tracking.
const props = defineProps<{ eventId: string }>()
const toast = useToast()
const { invites, stats, addInvite, removeInvite, seedFromLastEvent, sendInvites } = useEventInvites(() => props.eventId)

const newEmail = ref('')
const newName = ref('')
const sending = ref(false)
const seeding = ref(false)
const emailSchema = z.string().email()

// Auto-roll: the first time we see an empty list for this event, pull last
// event's invitees ("auto add from last event unless we remove them").
const seededFor = ref<string | null>(null)
watch([() => props.eventId, invites], async ([id, list]) => {
  if (id && seededFor.value !== id && list.length === 0) {
    seededFor.value = id
    const n = await seedFromLastEvent().catch(() => 0)
    if (n) toast.add({ title: `Pulled ${n} from the last movie night`, color: 'neutral' })
  }
}, { immediate: true })

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
    const { sent } = await sendInvites()
    toast.add({
      title: sent ? `Sent ${sent} invite${sent === 1 ? '' : 's'}` : 'Everyone has already been invited',
      icon: 'i-lucide-send',
      color: 'success'
    })
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

    <!-- Guest list -->
    <ul v-if="invites.length" class="divide-y divide-default rounded-lg ring ring-default overflow-hidden">
      <li v-for="invite in invites" :key="invite.id" class="flex items-center gap-3 p-3">
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
