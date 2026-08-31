<script setup lang="ts">
import { parseRoster } from '#shared/utils/roster'
import { errorMessage } from '#shared/utils/errorMessage'

// Idle-mode roster seeding: with no movie night scheduled there's no event to
// e-vite anyone to, so admins add people to the club allowlist here and each new
// person gets a "you're in the club, we'll tell you when the next one lands" email.
const { roster, pendingCount, existingEmails, addToRoster } = useRoster()
const toast = useToast()

const text = ref('')
const submitting = ref(false)

// Parsed live so the admin sees exactly who will be added before sending.
const parsed = computed(() => parseRoster(text.value))
const alreadyOnRoster = computed(() => parsed.value.entries.filter(e => existingEmails.value.has(e.email)))
const toAdd = computed(() => parsed.value.entries.filter(e => !existingEmails.value.has(e.email)))

function remove(email: string): void {
  // Drop the person from the box itself, so the textarea stays the source of truth.
  text.value = parsed.value.entries
    .filter(e => e.email !== email)
    .map(e => (e.name ? `${e.name} <${e.email}>` : e.email))
    .join('\n')
}

async function onSubmit(): Promise<void> {
  submitting.value = true
  try {
    const result = await addToRoster(text.value)
    if (result.added && result.failed) {
      toast.add({
        title: `Added ${result.added}, but ${result.failed} email${result.failed === 1 ? '' : 's'} failed`,
        description: result.error ?? undefined,
        icon: 'i-lucide-mail-warning',
        color: 'warning'
      })
    } else if (result.added) {
      toast.add({
        title: `Added ${result.added} to the club`,
        description: result.emailed
          ? `Welcome email sent to ${result.emailed === 1 ? 'them' : `all ${result.emailed}`}.`
          : 'Email is not configured, so no welcome went out.',
        icon: 'i-lucide-mail-check',
        color: 'success'
      })
    } else {
      toast.add({ title: 'Everyone on that list is already in the club', color: 'neutral' })
    }
    text.value = ''
  } catch (error) {
    toast.add({
      title: 'Could not add them to the roster',
      description: errorMessage(error),
      icon: 'i-lucide-circle-alert',
      color: 'error'
    })
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="space-y-6">
    <UCard variant="subtle">
      <template #header>
        <div class="flex items-start gap-3">
          <UIcon
            name="i-lucide-moon-star"
            class="size-5 text-primary shrink-0 mt-0.5"
          />
          <div>
            <h2 class="font-semibold">
              The club is between screenings
            </h2>
            <p class="text-sm text-muted mt-1">
              No movie night is on the calendar, so there's nothing to e-vite anyone to yet.
              Add people to the roster now — they'll get a welcome email and be invited
              automatically when you schedule the next night.
            </p>
          </div>
        </div>
      </template>

      <div class="space-y-4">
        <UFormField
          label="Emails"
          name="emails"
          hint="One per line, or comma-separated"
          description="Accepts plain addresses or “Sam Riley &lt;sam@example.com&gt;”."
        >
          <UTextarea
            v-model="text"
            :rows="5"
            class="w-full"
            placeholder="jordan@example.com&#10;Sam Riley <sam@example.com>&#10;pat@example.com, avery@example.com"
            data-testid="roster-emails"
          />
        </UFormField>

        <div
          v-if="toAdd.length"
          class="flex flex-wrap gap-1.5"
        >
          <UBadge
            v-for="entry in toAdd"
            :key="entry.email"
            color="primary"
            variant="subtle"
            class="gap-1"
          >
            {{ entry.name || entry.email }}
            <UButton
              icon="i-lucide-x"
              size="xs"
              color="primary"
              variant="link"
              :padded="false"
              :aria-label="`Remove ${entry.email}`"
              @click="remove(entry.email)"
            />
          </UBadge>
        </div>

        <UAlert
          v-if="alreadyOnRoster.length"
          color="neutral"
          variant="subtle"
          icon="i-lucide-user-check"
          :title="`${alreadyOnRoster.length} already in the club`"
          :description="`${alreadyOnRoster.map(e => e.email).join(', ')} — they'll be skipped, and won't be emailed again.`"
        />

        <UAlert
          v-if="parsed.invalid.length"
          color="warning"
          variant="subtle"
          icon="i-lucide-circle-alert"
          :title="`${parsed.invalid.length} couldn't be read as an email`"
          :description="`${parsed.invalid.join(', ')} — fix or remove ${parsed.invalid.length === 1 ? 'it' : 'them'} above.`"
        />

        <div class="flex justify-end">
          <UButton
            :label="toAdd.length ? `Add ${toAdd.length} & send welcome email${toAdd.length === 1 ? '' : 's'}` : 'Add to the club'"
            icon="i-lucide-user-plus"
            :disabled="!toAdd.length"
            :loading="submitting"
            data-testid="roster-submit"
            @click="onSubmit"
          />
        </div>
      </div>
    </UCard>

    <UCard variant="subtle">
      <template #header>
        <h3 class="font-semibold">
          Club roster
          <span class="text-muted font-normal">
            — {{ roster.length }} {{ roster.length === 1 ? 'person' : 'people' }}<template v-if="pendingCount">, {{ pendingCount }} yet to sign in</template>
          </span>
        </h3>
      </template>
      <p
        v-if="!roster.length"
        class="text-sm text-muted"
      >
        Nobody on the roster yet. Add your people above.
      </p>
      <ul
        v-else
        class="divide-y divide-default"
      >
        <li
          v-for="person in roster"
          :key="person.email"
          class="py-2 flex items-center justify-between gap-3"
        >
          <div class="min-w-0">
            <p class="text-sm font-medium truncate">
              {{ person.display_name || person.email }}
            </p>
            <p
              v-if="person.display_name"
              class="text-xs text-muted truncate"
            >
              {{ person.email }}
            </p>
          </div>
          <UBadge
            :color="person.accepted_at ? 'success' : 'neutral'"
            variant="subtle"
            :label="person.accepted_at ? 'Joined' : 'Invited'"
          />
        </li>
      </ul>
    </UCard>
  </div>
</template>
