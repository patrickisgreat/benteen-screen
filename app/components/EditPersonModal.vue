<script setup lang="ts">
import type { PersonDetails } from '#shared/types/user'

// "Edit {person}" from the People tab: fix their display name and mobile
// number. Email is shown but not editable — for a member it is how they sign in,
// for a roster entry it is the key. The save lives in the parent
// (useAdminPeople.updatePerson).
const open = defineModel<boolean>('open', { default: false })
const props = withDefaults(defineProps<{ person: PersonDetails | null, saving?: boolean }>(), { saving: false })
const emit = defineEmits<{ save: [person: PersonDetails] }>()

const name = ref('')
const phoneInput = ref('')

// Reload the fields each time the modal opens for someone.
watch(open, (isOpen) => {
  if (!isOpen) return
  name.value = props.person?.displayName ?? ''
  phoneInput.value = props.person?.phone ? formatPhone(props.person.phone) : ''
}, { immediate: true })

const normalizedPhone = computed(() => normalizePhone(phoneInput.value))
const phoneInvalid = computed(() => Boolean(phoneInput.value.trim()) && normalizedPhone.value === null)
// Members must keep a name (it is shown all over the app); a roster entry may be a bare email.
const nameMissing = computed(() => Boolean(props.person?.profileId) && !name.value.trim())
const canSave = computed(() => Boolean(props.person) && !phoneInvalid.value && !nameMissing.value)

function onSave(): void {
  if (!props.person || !canSave.value) return
  emit('save', {
    ...props.person,
    displayName: name.value.trim() || null,
    phone: normalizedPhone.value
  })
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="person ? `Edit ${person.displayName || person.email}` : 'Edit person'"
    :description="person?.profileId ? 'Member' : 'On the roster, not signed in yet'"
  >
    <template #body>
      <form
        v-if="person"
        class="space-y-4"
        @submit.prevent="onSave"
      >
        <UFormField
          label="Name"
          :error="nameMissing ? 'A member needs a name' : undefined"
        >
          <UInput
            v-model="name"
            placeholder="Their name"
            aria-label="Name"
            class="w-full"
          />
        </UFormField>
        <UFormField
          label="Mobile number"
          hint="Admins only"
          :error="phoneInvalid ? 'Not a valid number — use 10 digits for US, or +country code.' : undefined"
        >
          <UInput
            v-model="phoneInput"
            type="tel"
            placeholder="(555) 123-4567"
            aria-label="Mobile number"
            class="w-full"
          />
        </UFormField>
        <UFormField
          label="Email"
          :hint="person.profileId ? 'How they sign in — can\'t be changed here' : 'The roster key — remove and re-add to change'"
        >
          <UInput
            :model-value="person.email"
            disabled
            aria-label="Email"
            class="w-full"
          />
        </UFormField>
      </form>
    </template>
    <template #footer>
      <div class="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 w-full">
        <UButton
          label="Cancel"
          color="neutral"
          variant="ghost"
          class="justify-center"
          @click="open = false"
        />
        <UButton
          label="Save"
          icon="i-lucide-check"
          class="justify-center"
          :disabled="!canSave"
          :loading="saving"
          @click="onSave"
        />
      </div>
    </template>
  </UModal>
</template>
