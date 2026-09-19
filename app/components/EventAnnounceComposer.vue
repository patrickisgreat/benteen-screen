<script setup lang="ts">
import { z } from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'
import type { CommsTemplate } from '#shared/types/comms-template'
import { ANNOUNCE_SCOPES, ANNOUNCE_SCOPE_VALUES, isClubWideScope, type AnnounceScope } from '#shared/utils/announce'

// Admin event blast composer → POST /api/events/announce (admin-gated server-side).
// The message is rich text (tiptap); the server sanitizes it to a strict tag
// allowlist before it goes into the email. Templates let a recurring blast
// (e.g. the vote + bring-list nudge) be applied, tweaked, and re-sent later.
//
// Audience is two decisions, not one: the scope picks a pool (this event's guest
// list, whoever's going, the whole club), then the named list below it lets the
// admin untick individuals. Nothing sends until you can see exactly who gets it.
const props = defineProps<{ eventId: string | undefined }>()
const toast = useToast()
const { run } = useToastAction()
const sending = ref(false)

const { templates, saveTemplate, removeTemplate } = useCommsTemplates()
const savingTemplate = ref(false)
const templateName = ref('')

const scopeOptions = ANNOUNCE_SCOPES.map(s => ({ label: s.label, value: s.value }))

const schema = z.object({
  subject: z.string().trim().max(200).optional(),
  message: z.string().max(10000).refine(m => htmlToText(m).length > 0, 'Write a message'),
  scope: z.enum(ANNOUNCE_SCOPE_VALUES)
})
const state = reactive<{ subject: string, message: string, scope: AnnounceScope }>({
  subject: '',
  message: '',
  // This event's guest list — never the whole club by default.
  scope: 'guests'
})

const {
  recipients,
  selected,
  pending: loadingRecipients,
  error: recipientError,
  allSelected,
  toggle,
  toggleAll
} = useAnnounceRecipients(() => props.eventId, () => state.scope)

const scopeHint = computed(() => ANNOUNCE_SCOPES.find(s => s.value === state.scope)?.hint ?? '')
const clubWide = computed(() => isClubWideScope(state.scope))
const messageHasText = computed(() => htmlToText(state.message).length > 0)
const sendLabel = computed(() =>
  selected.value.length ? `Send to ${selected.value.length}` : 'Send blast')

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

async function onSubmit(event: FormSubmitEvent<{ subject?: string, message: string, scope: AnnounceScope }>): Promise<void> {
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
        scope: event.data.scope,
        // Explicit: the blast goes to the names the admin just read, not to
        // whatever the scope happens to resolve to a moment later.
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
      <UFormField label="Audience" name="scope" :hint="scopeHint">
        <USelectMenu
          v-model="state.scope"
          :items="scopeOptions"
          value-key="value"
          :search-input="false"
          class="w-full sm:max-w-xs"
        />
      </UFormField>

      <UAlert
        v-if="clubWide"
        icon="i-lucide-triangle-alert"
        color="warning"
        variant="subtle"
        title="Club-wide blast"
        description="This goes to people who have nothing to do with this event. Untick anyone who shouldn't get it."
      />

      <!-- Who this actually reaches — named, counted, and editable before sending. -->
      <div class="rounded-lg ring ring-default overflow-hidden">
        <div class="flex items-center gap-3 p-3 bg-elevated/50">
          <UCheckbox
            :model-value="allSelected"
            :disabled="!recipients.length"
            aria-label="Select all recipients"
            @update:model-value="toggleAll(!allSelected)"
          />
          <p class="text-sm font-medium">
            <span v-if="loadingRecipients">Checking who this reaches…</span>
            <span v-else-if="recipientError" class="text-error">{{ recipientError }}</span>
            <span v-else-if="!recipients.length">Nobody matches this audience</span>
            <span v-else>Sending to {{ selected.length }} of {{ recipients.length }}</span>
          </p>
        </div>
        <ul v-if="recipients.length" class="divide-y divide-default max-h-64 overflow-y-auto">
          <li v-for="person in recipients" :key="person.email" class="flex items-center gap-3 px-3 py-2">
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
              <p v-if="person.name" class="text-xs text-muted truncate">
                {{ person.email }}
              </p>
            </div>
          </li>
        </ul>
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
