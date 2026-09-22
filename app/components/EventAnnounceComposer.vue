<script setup lang="ts">
import { z } from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'
import type { CommsTemplate } from '#shared/types/comms-template'
import type { RsvpStatus } from '#shared/types/rsvp'
import type { AnnouncePerson } from '#shared/utils/announce'
import {
  ANNOUNCE_PRESETS,
  CUSTOM_ANNOUNCE_SCOPE,
  DEFAULT_ANNOUNCE_PRESET,
  announceScopeLabel,
  isClubWidePreset,
  rsvpLabel
} from '#shared/utils/announce'

// Admin event blast composer → POST /api/events/announce (admin-gated server-side).
// The message is rich text (tiptap); the server sanitizes it to a strict tag
// allowlist before it goes into the email. Templates let a recurring blast
// (e.g. the vote + bring-list nudge) be applied, tweaked, and re-sent later.
//
// The recipient picker opens on whoever has RSVP'd yes and says so. Everything
// else — the other groupings, the search, the individual ticks — edits that
// starting point in place, so the blast is always a list the admin has read.
const props = defineProps<{ eventId: string | undefined }>()
const toast = useToast()
const { run } = useToastAction()
const sending = ref(false)

const { templates, saveTemplate, removeTemplate } = useCommsTemplates()
const savingTemplate = ref(false)
const templateName = ref('')

const {
  people,
  selected,
  visible,
  search,
  pending: loadingPeople,
  error: audienceError,
  counts,
  activeScope,
  allVisibleSelected,
  applyPreset,
  toggle,
  setVisible
} = useAnnounceRecipients(() => props.eventId)

const schema = z.object({
  subject: z.string().trim().max(200).optional(),
  message: z.string().max(10000).refine(m => htmlToText(m).length > 0, 'Write a message')
})
const state = reactive<{ subject: string, message: string }>({ subject: '', message: '' })

const defaultPreset = ANNOUNCE_PRESETS.find(p => p.id === DEFAULT_ANNOUNCE_PRESET)
const isCustom = computed(() => activeScope.value === CUSTOM_ANNOUNCE_SCOPE)
const audienceName = computed(() => announceScopeLabel(activeScope.value))
const audienceHint = computed(() => {
  if (isCustom.value) return 'You picked these people yourself.'
  const preset = ANNOUNCE_PRESETS.find(p => p.id === activeScope.value)
  return preset?.hint ?? ''
})
const clubWide = computed(() => isClubWidePreset(activeScope.value))
const messageHasText = computed(() => htmlToText(state.message).length > 0)
const sendLabel = computed(() =>
  selected.value.length ? `Send to ${selected.value.length}` : 'Send blast')

const RSVP_COLOR = { going: 'success', maybe: 'warning', no: 'neutral' } as const satisfies Record<RsvpStatus, string>
function rsvpColor(rsvp: RsvpStatus | null): 'success' | 'warning' | 'neutral' {
  return rsvp ? RSVP_COLOR[rsvp] : 'neutral'
}

/** The muted line under a name: their address, and a warning when they aren't
 *  actually invited to this event — someone easy to mail by accident. */
function secondaryLine(person: AnnouncePerson): string {
  const parts = [person.name ? person.email : '', person.onGuestList ? '' : 'not on the guest list']
  return parts.filter(Boolean).join(' · ')
}

/** Untick everyone — the starting point for building a list from scratch. */
function clearAll(): void {
  selected.value = []
}

// The subject always mirrors the chosen template — including clearing it for a
// subject-less template — so the form never shows a stale draft as "applied".
function applyTemplate(template: CommsTemplate): void {
  state.message = template.body
  state.subject = template.subject ?? ''
}

async function onSaveTemplate(): Promise<void> {
  const name = templateName.value.trim()
  if (!name || !messageHasText.value) return
  if (await run(() => saveTemplate(name, state.subject || null, state.message), 'Could not save the template')) {
    toast.add({ title: 'Template saved', icon: 'i-lucide-check', color: 'success' })
    savingTemplate.value = false
    templateName.value = ''
  }
}

async function onRemoveTemplate(template: CommsTemplate): Promise<void> {
  if (await run(() => removeTemplate(template), 'Could not delete the template')) {
    toast.add({ title: 'Template deleted', icon: 'i-lucide-check', color: 'success' })
  }
}

function messageOf(error: unknown): string | undefined {
  if (error && typeof error === 'object' && 'statusMessage' in error) {
    const m = (error as { statusMessage?: unknown }).statusMessage
    if (typeof m === 'string') return m
  }
  return error instanceof Error ? error.message : undefined
}

async function onSubmit(event: FormSubmitEvent<{ subject?: string, message: string }>): Promise<void> {
  if (!props.eventId) {
    toast.add({ title: 'Pick an event first', color: 'warning' })
    return
  }
  if (!selected.value.length) {
    toast.add({ title: 'Nobody is selected', color: 'warning' })
    return
  }
  sending.value = true
  try {
    const res = await $fetch<{ ok: boolean, count: number, failed?: number, error?: string | null }>('/api/events/announce', {
      method: 'POST',
      body: {
        eventId: props.eventId,
        subject: event.data.subject || undefined,
        message: event.data.message,
        // Explicit: the blast goes to the names the admin just read, not to
        // whatever a grouping happens to resolve to a moment later.
        recipients: [...selected.value]
      }
    })
    const failed = res.failed ?? 0
    if (res.count && failed) {
      // Partial delivery — some groups went out, some didn't (don't pretend full success).
      toast.add({ title: `Sent to ${res.count}, ${failed} failed`, description: res.error ?? undefined, icon: 'i-lucide-send', color: 'warning' })
    } else if (res.count) {
      toast.add({ title: `Sent to ${res.count} ${res.count === 1 ? 'person' : 'people'}`, icon: 'i-lucide-send', color: 'success' })
    } else if (failed) {
      toast.add({ title: 'Could not send the blast', description: res.error ?? undefined, color: 'error' })
    } else {
      toast.add({ title: 'No recipients matched', color: 'warning' })
    }
    // Keep the draft if nothing went out, so the admin can retry.
    if (res.count) {
      state.subject = ''
      state.message = ''
    }
  } catch (error) {
    toast.add({ title: 'Could not send the blast', description: messageOf(error), color: 'error' })
  } finally {
    sending.value = false
  }
}
</script>

<template>
  <div class="space-y-3">
    <div v-if="templates.length" class="space-y-1.5">
      <p class="text-xs font-medium text-muted">
        Templates
      </p>
      <div class="flex flex-wrap gap-2">
        <UButtonGroup v-for="tpl in templates" :key="tpl.id" size="xs">
          <UButton :label="tpl.name" icon="i-lucide-file-text" color="neutral" variant="outline" @click="applyTemplate(tpl)" />
          <UButton
            icon="i-lucide-x"
            color="neutral"
            variant="outline"
            :aria-label="`Delete template ${tpl.name}`"
            @click="onRemoveTemplate(tpl)"
          />
        </UButtonGroup>
      </div>
    </div>

    <UForm :schema="schema" :state="state" class="space-y-3" @submit="onSubmit">
      <!-- Recipients: who this reaches, why, and every lever to change it. -->
      <div class="rounded-lg ring ring-default divide-y divide-default">
        <div class="p-3 space-y-1">
          <div class="flex flex-wrap items-center gap-2">
            <p class="text-sm font-medium">
              <span v-if="loadingPeople">Checking who this reaches…</span>
              <span v-else-if="audienceError" class="text-error">{{ audienceError }}</span>
              <span v-else>Sending to {{ selected.length }} {{ selected.length === 1 ? 'person' : 'people' }}</span>
            </p>
            <UBadge
              v-if="!loadingPeople && !audienceError"
              :label="audienceName"
              :color="isCustom ? 'neutral' : 'primary'"
              variant="subtle"
              size="sm"
            />
            <UBadge
              v-if="activeScope === DEFAULT_ANNOUNCE_PRESET"
              label="Default"
              color="neutral"
              variant="outline"
              size="sm"
            />
          </div>
          <p class="text-xs text-muted">
            {{ audienceHint }}
          </p>
        </div>

        <!-- Groupings: one click re-picks the whole list; counts show the blast radius. -->
        <div class="p-3 space-y-2">
          <p class="text-xs font-medium text-muted">
            Start from a group
          </p>
          <div class="flex flex-wrap gap-2">
            <UButton
              v-for="preset in ANNOUNCE_PRESETS"
              :key="preset.id"
              size="xs"
              :label="`${preset.label} (${counts[preset.id]})`"
              :color="isClubWidePreset(preset.id) ? 'warning' : 'neutral'"
              :variant="activeScope === preset.id ? 'solid' : 'outline'"
              :title="preset.hint"
              @click="applyPreset(preset.id)"
            />
          </div>
          <UAlert
            v-if="clubWide"
            icon="i-lucide-triangle-alert"
            color="warning"
            variant="subtle"
            title="Club-wide blast"
            description="This reaches people with nothing to do with this event. Untick anyone who shouldn't get it."
          />
        </div>

        <!-- The list itself: search, bulk-tick what's shown, tick anyone by hand. -->
        <div class="p-3 space-y-2">
          <UInput
            v-model="search"
            icon="i-lucide-search"
            placeholder="Search name or email"
            size="sm"
            class="w-full"
            aria-label="Search recipients"
          />
          <div class="flex items-center gap-3">
            <UCheckbox
              :model-value="allVisibleSelected"
              :disabled="!visible.length"
              :aria-label="search ? 'Select everyone shown' : 'Select everyone'"
              @update:model-value="setVisible(!allVisibleSelected)"
            />
            <span class="text-xs text-muted">
              {{ search ? `${visible.length} shown` : `${people.length} in the address book` }}
            </span>
            <UButton
              v-if="activeScope !== DEFAULT_ANNOUNCE_PRESET"
              size="xs"
              variant="ghost"
              color="neutral"
              :label="`Reset to ${defaultPreset?.label}`"
              class="ml-auto"
              @click="applyPreset(DEFAULT_ANNOUNCE_PRESET)"
            />
            <UButton
              v-else
              size="xs"
              variant="ghost"
              color="neutral"
              label="Clear"
              :disabled="!selected.length"
              class="ml-auto"
              @click="clearAll"
            />
          </div>

          <ul v-if="visible.length" class="divide-y divide-default rounded-lg ring ring-default max-h-72 overflow-y-auto">
            <li v-for="person in visible" :key="person.email" class="flex items-center gap-3 px-3 py-2">
              <UCheckbox
                :model-value="selected.includes(person.email)"
                :aria-label="`Send to ${person.name || person.email}`"
                class="shrink-0"
                @update:model-value="toggle(person.email)"
              />
              <div class="min-w-0 flex-1">
                <p class="text-sm truncate">
                  {{ person.name || person.email }}
                </p>
                <p v-if="secondaryLine(person)" class="text-xs text-muted truncate">
                  {{ secondaryLine(person) }}
                </p>
              </div>
              <UBadge
                :label="rsvpLabel(person.rsvp)"
                :color="rsvpColor(person.rsvp)"
                variant="subtle"
                size="sm"
                class="shrink-0"
              />
            </li>
          </ul>
          <p v-else-if="!loadingPeople" class="text-sm text-muted px-1 py-2">
            {{ search ? 'Nobody matches that search.' : 'Nobody to email for this event yet.' }}
          </p>
        </div>
      </div>

      <UFormField label="Subject" name="subject" hint="Optional">
        <UInput v-model="state.subject" placeholder="Movie night reminder" class="w-full" />
      </UFormField>
      <UFormField label="Message" name="message" required>
        <RichTextEditor v-model="state.message" />
      </UFormField>

      <div v-if="savingTemplate" class="flex gap-2">
        <UInput v-model="templateName" placeholder="Template name" class="flex-1" @keydown.enter.prevent="onSaveTemplate" />
        <UButton label="Save" :disabled="!templateName.trim()" @click="onSaveTemplate" />
        <UButton label="Cancel" color="neutral" variant="ghost" @click="savingTemplate = false" />
      </div>

      <div class="flex flex-wrap justify-between gap-2">
        <UButton
          v-if="!savingTemplate"
          label="Save as template"
          icon="i-lucide-bookmark-plus"
          color="neutral"
          variant="outline"
          :disabled="!messageHasText"
          @click="savingTemplate = true"
        />
        <UButton
          type="submit"
          :label="sendLabel"
          icon="i-lucide-megaphone"
          :loading="sending"
          :disabled="!eventId || !selected.length"
          class="ml-auto"
        />
      </div>
    </UForm>
  </div>
</template>
