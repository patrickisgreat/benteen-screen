<script setup lang="ts">
import { ANNOUNCE_CUSTOM_LIMIT, ANNOUNCE_SCOPE_OPTIONS, type AnnounceRecipient, type AnnounceScope } from '#shared/utils/announce'

// Who an announcement goes to. A radio group that spells out each audience, a
// directory search + chips for hand-picking people, and a live "will email N
// people" preview resolved by the same server code that sends — so the number
// the admin sees is the number that goes out. Emits the count so the composer
// can label the send button and block an empty blast.
const scope = defineModel<AnnounceScope>('scope', { required: true })
const emails = defineModel<string[]>('emails', { default: () => [] })
const props = withDefaults(defineProps<{ eventId: string | undefined, debounceMs?: number }>(), { debounceMs: 300 })
const emit = defineEmits<{ count: [count: number | null] }>()

// URadioGroup wants a mutable array; the options themselves are frozen in shared/.
const scopeItems = [...ANNOUNCE_SCOPE_OPTIONS]

interface Picked { email: string, name: string | null }
const picked = ref<Picked[]>([])
const atLimit = computed(() => picked.value.length >= ANNOUNCE_CUSTOM_LIMIT)

function addPerson(email: string, name?: string): void {
  if (atLimit.value || picked.value.some(p => p.email === email)) return
  picked.value = [...picked.value, { email, name: name ?? null }]
  emails.value = picked.value.map(p => p.email)
}

function removePerson(email: string): void {
  picked.value = picked.value.filter(p => p.email !== email)
  emails.value = picked.value.map(p => p.email)
}

// --- Live audience preview ---------------------------------------------------
const recipients = ref<AnnounceRecipient[] | null>(null)
const loading = ref(false)
const previewError = ref<string | null>(null)
const count = computed(() => recipients.value?.length ?? null)

async function loadPreview(): Promise<void> {
  const eventId = props.eventId
  if (!eventId || (scope.value === 'custom' && !emails.value.length)) {
    recipients.value = eventId ? [] : null
    previewError.value = null
    emit('count', eventId ? 0 : null)
    return
  }
  loading.value = true
  try {
    const res = await $fetch<{ ok: boolean, count: number, recipients: AnnounceRecipient[] }>('/api/events/announce', {
      method: 'POST',
      body: { eventId, scope: scope.value, emails: scope.value === 'custom' ? emails.value : undefined, preview: true }
    })
    recipients.value = res.recipients
    previewError.value = null
    emit('count', res.count)
  } catch (error) {
    recipients.value = null
    previewError.value = error instanceof Error ? error.message : 'Could not count recipients'
    emit('count', null)
  } finally {
    loading.value = false
  }
}

let timer: ReturnType<typeof setTimeout> | null = null
watch([() => props.eventId, scope, emails], () => {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    void loadPreview()
  }, props.debounceMs)
}, { immediate: true, deep: true })
onScopeDispose(() => {
  if (timer) clearTimeout(timer)
})

const summary = computed(() => {
  if (loading.value) return 'Counting…'
  if (previewError.value) return previewError.value
  if (count.value === null) return ''
  if (count.value === 0) return scope.value === 'custom' ? 'Pick at least one person.' : 'No one matches — nothing would be sent.'
  return `Will email ${count.value} ${count.value === 1 ? 'person' : 'people'}`
})
</script>

<template>
  <div class="space-y-3">
    <URadioGroup
      v-model="scope"
      :items="scopeItems"
      value-key="value"
      legend="Audience"
      variant="table"
    />

    <div
      v-if="scope === 'custom'"
      class="space-y-2"
    >
      <GuestPicker
        :exclude="emails"
        @add="addPerson"
      />
      <ul
        v-if="picked.length"
        class="flex flex-wrap gap-1.5"
        aria-label="Chosen people"
      >
        <li
          v-for="p in picked"
          :key="p.email"
          class="inline-flex items-center gap-1 rounded-full bg-elevated/60 py-0.5 pl-2.5 pr-1 text-sm"
        >
          <span class="truncate max-w-48">{{ p.name || p.email }}</span>
          <UButton
            icon="i-lucide-x"
            size="xs"
            color="neutral"
            variant="ghost"
            :aria-label="`Remove ${p.name || p.email}`"
            @click="removePerson(p.email)"
          />
        </li>
      </ul>
      <p
        v-if="atLimit"
        class="text-xs text-warning"
      >
        That's the limit of {{ ANNOUNCE_CUSTOM_LIMIT }} people for one blast.
      </p>
    </div>

    <div
      class="text-sm"
      aria-live="polite"
    >
      <p
        :class="previewError ? 'text-error' : 'text-muted'"
        data-testid="audience-summary"
      >
        {{ summary }}
      </p>
      <UCollapsible
        v-if="recipients && recipients.length"
        class="mt-1"
      >
        <UButton
          label="Show who"
          icon="i-lucide-users"
          trailing-icon="i-lucide-chevron-down"
          color="neutral"
          variant="link"
          size="xs"
          class="px-0"
        />
        <template #content>
          <p class="text-xs text-muted mt-1">
            {{ recipients.map(r => r.name || r.email).join(', ') }}
          </p>
        </template>
      </UCollapsible>
    </div>
  </div>
</template>
