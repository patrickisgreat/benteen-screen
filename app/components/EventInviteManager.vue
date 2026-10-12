<script setup lang="ts">
import type { EventInvite } from '#shared/types/event-invite'
import type { MovieEvent } from '#shared/types/event'
import type { RsvpStatus } from '#shared/types/rsvp'
import { INVITE_ACCENTS, INVITE_THEMES, type InviteAccent, type InviteOptions, type InviteTheme } from '#shared/types/invite-options'
import type { TextVars } from '#shared/utils/sms'

// Admin guest-list manager + Evite tracker + e-vite editor for one event. Lets
// admins customize the invite (theme/accent/message/toggles with a live preview),
// add guests (live-searching the club directory via GuestPicker) / remove them,
// pull last event's list in on demand, send tokenized e-vites, RSVP (and +1) on
// a guest's behalf, text guests from the host's own phone (one at a time, or a
// group text to everyone who hasn't replied), and shows live RSVP / open / click
// tracking.
const props = defineProps<{ eventId: string, event?: MovieEvent | null }>()
const toast = useToast()
const { invites, stats, addInvite, removeInvite, removeInvites, seedFromLastEvent, sendInvites, remindNonResponders, setRsvp, notifyRsvp, setPhone, markTexted } = useEventInvites(() => props.eventId)
const { save: saveInviteOptions } = useInviteOptions(() => props.eventId)
const { setEnabled: setRemindersEnabled } = useEventReminders(() => props.eventId)

// Per-event auto-reminder toggle (defaults on). Re-sync if the event loads late.
const remindersOn = ref(props.event?.reminders_enabled ?? true)
watch(() => props.event?.id, () => {
  remindersOn.value = props.event?.reminders_enabled ?? true
})
async function onToggleReminders(value: boolean): Promise<void> {
  remindersOn.value = value
  try {
    await setRemindersEnabled(value)
    toast.add({ title: value ? 'Auto-reminders on for this event' : 'Auto-reminders off for this event', icon: 'i-lucide-check', color: 'success' })
  } catch {
    remindersOn.value = !value // revert on failure
    toast.add({ title: 'Could not update reminders', color: 'error' })
  }
}
// The TRUE RSVP total = e-vite email replies + in-app RSVPs, merged + deduped.
// `stats.*` above is the email funnel only (invited/opened/clicked); these are the
// reconciled headcounts the admin actually plans around.
const { roster } = useEventRsvps(() => props.eventId)

// --- RSVP on a guest's behalf ---------------------------------------------
// Tracks which row is being answered for; the modal reads the live invite so it
// reflects each save (realtime / refresh) without local copies.
const rsvpForId = ref<string | null>(null)
const rsvpOpen = ref(false)
const notifying = ref(false)
const rsvpFor = computed(() => invites.value.find(i => i.id === rsvpForId.value) ?? null)
const rosterCounts = computed(() => ({
  going: roster.value.going.length,
  maybe: roster.value.maybe.length,
  no: roster.value.no.length,
  guests: Math.max(0, roster.value.headcount - roster.value.going.length)
}))

function openRsvpFor(invite: EventInvite): void {
  rsvpForId.value = invite.id
  rsvpOpen.value = true
}

async function onSetRsvp(status: RsvpStatus | null, plusOnes: number): Promise<void> {
  const invite = rsvpFor.value
  if (!invite) return
  try {
    await setRsvp(invite.id, status, plusOnes)
  } catch (error) {
    toast.add({ title: `Could not save ${invite.display_name || invite.email}'s RSVP`, description: error instanceof Error ? error.message : undefined, color: 'error' })
  }
}

async function onNotifyRsvp(): Promise<void> {
  const invite = rsvpFor.value
  if (!invite) return
  const name = invite.display_name || invite.email
  notifying.value = true
  try {
    const { sent, error } = await notifyRsvp(invite.id)
    if (sent) toast.add({ title: `Confirmation emailed to ${name}`, icon: 'i-lucide-mail-check', color: 'success' })
    else toast.add({ title: `Could not email ${name}`, description: error ?? undefined, color: 'error' })
  } catch (error) {
    toast.add({ title: `Could not email ${name}`, description: error instanceof Error ? error.message : undefined, color: 'error' })
  } finally {
    notifying.value = false
  }
}

const sending = ref(false)
const seeding = ref(false)
const deleting = ref(false)
const reminding = ref(false)

// People who were e-vited but haven't RSVP'd — the manual "remind now" audience.
const remindable = computed(() => invites.value.filter(i => !i.rsvp && i.sent_at).length)

async function onRemind(): Promise<void> {
  reminding.value = true
  try {
    const { sent, failed, error } = await remindNonResponders()
    if (sent && failed) {
      toast.add({ title: `Reminded ${sent}, ${failed} failed`, description: error ?? undefined, icon: 'i-lucide-bell', color: 'warning' })
    } else if (sent) {
      toast.add({ title: `Reminded ${sent} ${sent === 1 ? 'person' : 'people'}`, icon: 'i-lucide-bell', color: 'success' })
    } else if (failed) {
      toast.add({ title: 'Could not send reminders', description: error ?? undefined, color: 'error' })
    } else {
      toast.add({ title: 'Everyone has already replied', color: 'neutral' })
    }
  } catch (error) {
    toast.add({ title: 'Could not send reminders', description: error instanceof Error ? error.message : undefined, color: 'error' })
  } finally {
    reminding.value = false
  }
}

// Their personal one-click RSVP page — what goes in a text or DM.
const rsvpLink = (invite: EventInvite): string => `${location.origin}/rsvp?token=${invite.token}`

async function copyRsvpLink(invite: EventInvite): Promise<void> {
  const url = rsvpLink(invite)
  try {
    await navigator.clipboard.writeText(url)
    toast.add({ title: 'RSVP link copied', icon: 'i-lucide-check', color: 'success' })
  } catch {
    toast.add({ title: 'Copy failed — here it is', description: url, color: 'warning' })
  }
}

// --- Texting from the host's phone -----------------------------------------
// The app never sends SMS: each button is an `sms:` link that opens Messages
// pre-addressed and pre-filled, and the host taps send. We only remember numbers
// (setPhone) and who's been nudged (markTexted).
const textForId = ref<string | null>(null)
const textOpen = ref(false)
const textFor = computed(() => invites.value.find(i => i.id === textForId.value) ?? null)
const textTemplate = computed(() => options.value.textMessage.trim() || DEFAULT_TEXT_TEMPLATE)

// Placeholder values for one guest, or for the whole group (no personal link then).
function textVars(invite: EventInvite | null): TextVars {
  const ev = props.event
  return {
    name: invite ? textName(invite.display_name, invite.email) : 'everyone',
    event: ev?.title ?? 'movie night',
    date: ev?.event_date ? formatDate(ev.event_date, { weekday: 'short', month: 'short', day: 'numeric' }) : 'soon',
    link: invite ? rsvpLink(invite) : location.origin
  }
}
const textMessageFor = computed(() => renderTextTemplate(textTemplate.value, textVars(textFor.value)))

function openTextFor(invite: EventInvite): void {
  textForId.value = invite.id
  textOpen.value = true
}

async function onSavePhone(phone: string | null): Promise<void> {
  const invite = textFor.value
  if (!invite) return
  try {
    await setPhone(invite.id, phone)
    toast.add({ title: phone ? 'Number saved' : 'Number removed', icon: 'i-lucide-check', color: 'success' })
  } catch (error) {
    toast.add({ title: 'Could not save the number', description: error instanceof Error ? error.message : undefined, color: 'error' })
  }
}

// Messages is opening (the button is the sms: link); remember the number if it's
// new and stamp them texted. Failures here never block the text itself.
async function onText(phone: string): Promise<void> {
  const invite = textFor.value
  if (!invite) return
  try {
    if (phone !== invite.phone) await setPhone(invite.id, phone)
    await markTexted([invite.id])
  } catch (error) {
    toast.add({ title: 'Could not mark them as texted', description: error instanceof Error ? error.message : undefined, color: 'error' })
  }
}

// Group text: everyone who hasn't replied and has a number, in one conversation.
const groupTextable = computed(() => invites.value.filter(i => !i.rsvp && i.phone))
const groupMissingNumbers = computed(() => invites.value.filter(i => !i.rsvp && !i.phone).length)
const groupTextHref = computed(() => {
  const numbers = groupTextable.value.flatMap(i => (i.phone ? [i.phone] : []))
  if (!numbers.length) return undefined
  return buildSmsHref(numbers, renderTextTemplate(textTemplate.value, textVars(null)))
})

async function onGroupText(): Promise<void> {
  try {
    await markTexted(groupTextable.value.map(i => i.id))
  } catch (error) {
    toast.add({ title: 'Could not mark them as texted', description: error instanceof Error ? error.message : undefined, color: 'error' })
  }
}

// --- E-vite editor ---------------------------------------------------------
const THEME_LABELS: Record<InviteTheme, string> = { marquee: 'Marquee', neon: 'Neon', classic: 'Classic' }
const ACCENT_SWATCH: Record<InviteAccent, string> = { green: 'bg-green-600', red: 'bg-red-600', amber: 'bg-amber-600' }
const options = ref<InviteOptions>(normalizeInviteOptions(props.event?.invite_options ?? null))
const savingOptions = ref(false)

// Re-sync the editor if the event changes underneath us (e.g. data loads late).
watch(() => props.event?.id, () => {
  options.value = normalizeInviteOptions(props.event?.invite_options ?? null)
})

// The live preview is the exact same builder the server uses to send.
const previewHtml = computed(() => {
  const ev = props.event
  if (!ev) return ''
  return buildEventInviteEmail({
    eventTitle: ev.title,
    eventDate: ev.event_date ? formatEmailDate(ev.event_date) : null,
    eventTime: ev.start_time,
    location: ev.location,
    locationUrl: ev.location_url,
    posterUrl: ev.poster_url,
    description: ev.description,
    inviterName: null,
    rsvpUrl: '#',
    appUrl: '#',
    options: options.value
  }).html
})

// Debounce the iframe srcdoc so typing in the message doesn't refetch the
// preview's <link> font on every keystroke.
const debouncedPreview = useDebouncedValue(previewHtml, 250)

async function onSaveOptions(): Promise<void> {
  savingOptions.value = true
  try {
    await saveInviteOptions(options.value)
    toast.add({ title: 'E-vite settings saved', icon: 'i-lucide-check', color: 'success' })
  } catch {
    toast.add({ title: 'Could not save the settings', color: 'error' })
  } finally {
    savingOptions.value = false
  }
}

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

// Emails already on the list — the picker hides these from its matches.
const listedEmails = computed(() => invites.value.map(i => i.email))

async function onAdd(email: string, name?: string, phone?: string): Promise<void> {
  try {
    await addInvite(email, name, phone)
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
  if (invite.rsvp === 'going') return { label: invite.plus_ones > 0 ? `Going +${invite.plus_ones}` : 'Going', color: 'success' }
  if (invite.rsvp === 'maybe') return { label: 'Maybe', color: 'warning' }
  if (invite.rsvp === 'no') return { label: 'Can\'t make it', color: 'neutral' }
  // Nudged but still no reply — so admins can see who's been pinged (and not double-send).
  // A personal text is the most recent, most deliberate nudge, so it wins over an email reminder.
  if (invite.texted_at) return { label: 'Texted', color: 'info' }
  if (invite.reminded_at) return { label: 'Reminded', color: 'info' }
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
          {{ roster.going.length }}
        </p>
        <p class="text-xs text-muted">
          going
        </p>
      </UCard>
      <UCard variant="subtle" :ui="{ body: 'p-3' }">
        <p class="text-xl font-bold text-warning">
          {{ roster.maybe.length }}
        </p>
        <p class="text-xs text-muted">
          maybe
        </p>
      </UCard>
      <UCard variant="subtle" :ui="{ body: 'p-3' }">
        <p class="text-xl font-bold">
          {{ roster.no.length }}
        </p>
        <p class="text-xs text-muted">
          can't
        </p>
      </UCard>
      <UCard variant="subtle" :ui="{ body: 'p-3' }">
        <p class="text-xl font-bold text-muted">
          {{ roster.noReply.length }}
        </p>
        <p class="text-xs text-muted">
          no reply
        </p>
      </UCard>
    </div>

    <!-- The merged roster: who's actually coming, by name (e-vite + in-app) -->
    <UCard variant="subtle" :ui="{ body: 'sm:p-4 p-3' }">
      <h3 class="text-sm font-semibold text-muted mb-3 flex items-center gap-1.5">
        <UIcon name="i-lucide-users" /> Who's RSVP'd · {{ roster.total }} total
      </h3>
      <RsvpRoster :roster="roster" show-no-reply />
    </UCard>

    <!-- E-vite editor: customize the design + live preview -->
    <UCollapsible v-if="event" :unmount-on-hide="false" class="rounded-lg ring ring-default">
      <UButton
        label="Customize the e-vite"
        icon="i-lucide-palette"
        color="neutral"
        variant="ghost"
        trailing-icon="i-lucide-chevron-down"
        block
        class="justify-between"
      />
      <template #content>
        <div class="grid md:grid-cols-2 gap-5 p-4 border-t border-default">
          <!-- Controls -->
          <div class="space-y-4">
            <div>
              <p class="text-sm font-semibold mb-1.5">
                Theme
              </p>
              <div class="flex gap-2">
                <UButton
                  v-for="t in INVITE_THEMES"
                  :key="t"
                  :label="THEME_LABELS[t]"
                  size="sm"
                  :color="options.theme === t ? 'primary' : 'neutral'"
                  :variant="options.theme === t ? 'solid' : 'outline'"
                  :aria-pressed="options.theme === t"
                  @click="() => { options.theme = t }"
                />
              </div>
            </div>

            <div>
              <p class="text-sm font-semibold mb-1.5">
                Accent
              </p>
              <div class="flex gap-2">
                <button
                  v-for="a in INVITE_ACCENTS"
                  :key="a"
                  type="button"
                  :aria-label="`Accent ${a}`"
                  :aria-pressed="options.accent === a"
                  class="size-7 rounded-full ring-2 ring-offset-2 ring-offset-default transition"
                  :class="[ACCENT_SWATCH[a], options.accent === a ? 'ring-primary' : 'ring-transparent']"
                  @click="options.accent = a"
                />
              </div>
            </div>

            <div class="flex flex-wrap gap-4">
              <USwitch v-model="options.showPoster" label="Show poster" />
              <USwitch v-model="options.showDetails" label="Show date & details" />
            </div>

            <UFormField label="Personal message" hint="optional">
              <UTextarea
                v-model="options.message"
                :rows="3"
                placeholder="Bring a chair and a blanket — popcorn's on us!"
                class="w-full"
              />
            </UFormField>

            <UButton label="Save design" icon="i-lucide-save" size="sm" :loading="savingOptions" @click="onSaveOptions" />
          </div>

          <!-- Live preview -->
          <div>
            <p class="text-sm font-semibold mb-1.5">
              Live preview
            </p>
            <iframe
              :srcdoc="debouncedPreview"
              title="E-vite preview"
              sandbox=""
              class="w-full h-[460px] rounded-lg ring ring-default bg-white"
            />
          </div>
        </div>
      </template>
    </UCollapsible>

    <!-- Texting: the host's own phone does the sending -->
    <UCollapsible v-if="event" :unmount-on-hide="false" class="rounded-lg ring ring-default">
      <UButton
        label="Text people from your phone"
        icon="i-lucide-message-circle"
        color="neutral"
        variant="ghost"
        trailing-icon="i-lucide-chevron-down"
        block
        class="justify-between"
      />
      <template #content>
        <div class="space-y-4 p-4 border-t border-default">
          <p class="text-sm text-muted">
            Each button opens your Messages app with the number and message filled in, so the text comes from you.
            Nothing is sent until you tap send there. Text one person from their row, or everyone who hasn't replied at once.
          </p>

          <UFormField label="Message template" hint="{name}, {event}, {date} and {link} fill in per person">
            <UTextarea
              v-model="options.textMessage"
              :rows="3"
              :placeholder="DEFAULT_TEXT_TEMPLATE"
              aria-label="Text message template"
              class="w-full"
            />
          </UFormField>

          <div class="flex flex-wrap items-center gap-2">
            <UButton label="Save template" icon="i-lucide-save" size="sm" color="neutral" variant="outline" :loading="savingOptions" @click="onSaveOptions" />
            <UButton
              :label="groupTextable.length ? `Group text ${groupTextable.length} who ${groupTextable.length === 1 ? 'hasn\'t' : 'haven\'t'} replied` : 'No one to group text'"
              icon="i-lucide-messages-square"
              size="sm"
              :to="groupTextHref"
              external
              :disabled="!groupTextHref"
              @click="onGroupText"
            />
            <span v-if="groupMissingNumbers" class="text-xs text-muted">
              {{ groupMissingNumbers }} without a reply {{ groupMissingNumbers === 1 ? 'has' : 'have' }} no number yet — add one from their row.
            </span>
          </div>
          <p v-if="groupTextable.length" class="text-xs text-muted">
            A group text is one conversation everyone in it can see, so it uses a general link instead of personal RSVP links.
          </p>
        </div>
      </template>
    </UCollapsible>

    <!-- Add (live directory search or a new email) + actions -->
    <GuestPicker :exclude="listedEmails" @add="onAdd" />
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
      <UButton
        :label="remindable ? `Remind ${remindable} non-responder${remindable === 1 ? '' : 's'}` : 'No one to remind'"
        icon="i-lucide-bell"
        color="neutral"
        variant="outline"
        size="sm"
        :loading="reminding"
        :disabled="!remindable"
        @click="onRemind"
      />
    </div>

    <!-- Per-event auto-reminder toggle -->
    <USwitch
      :model-value="remindersOn"
      label="Auto-remind people who haven't RSVP'd"
      description="On the reminder checkpoints set in admin settings. Off skips this event."
      @update:model-value="onToggleReminders"
    />

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
          icon="i-lucide-user-check"
          color="neutral"
          variant="ghost"
          size="xs"
          :aria-label="`RSVP for ${invite.display_name || invite.email}`"
          class="shrink-0"
          @click="openRsvpFor(invite)"
        />
        <UButton
          icon="i-lucide-message-circle"
          color="neutral"
          variant="ghost"
          size="xs"
          :aria-label="`Text ${invite.display_name || invite.email}`"
          class="shrink-0"
          @click="openTextFor(invite)"
        />
        <UButton
          icon="i-lucide-link"
          color="neutral"
          variant="ghost"
          size="xs"
          aria-label="Copy RSVP link"
          class="shrink-0"
          @click="copyRsvpLink(invite)"
        />
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
      No guests yet — search for people above, or pull in last event's list.
    </p>

    <GuestRsvpModal
      v-model:open="rsvpOpen"
      :invite="rsvpFor"
      :counts="rosterCounts"
      :notifying="notifying"
      @set="onSetRsvp"
      @notify="onNotifyRsvp"
    />

    <GuestTextModal
      v-model:open="textOpen"
      :invite="textFor"
      :default-message="textMessageFor"
      @save-phone="onSavePhone"
      @text="onText"
    />
  </div>
</template>
