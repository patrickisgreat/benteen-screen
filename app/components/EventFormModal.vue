<script setup lang="ts">
import type { MovieEvent } from '#shared/types/event'

const open = defineModel<boolean>('open', { default: false })
const props = defineProps<{ event?: MovieEvent | null }>()
const emit = defineEmits<{ save: [payload: { id?: string, title: string, description: string, date: Date }] }>()

const title = ref('')
const description = ref('')
const dateStr = ref('')

const isEdit = computed(() => Boolean(props.event))
const canSave = computed(() => title.value.trim().length > 0 && dateStr.value.length > 0)

// Reset / hydrate the form each time the modal opens.
watch(open, (isOpen) => {
  if (!isOpen) return
  if (props.event) {
    title.value = props.event.title
    description.value = props.event.description ?? ''
    const date = toDate(props.event.timestamp)
    dateStr.value = toInputDate(date ?? new Date())
  } else {
    title.value = ''
    description.value = ''
    dateStr.value = toInputDate(new Date())
  }
})

function submit(): void {
  if (!canSave.value) return
  emit('save', {
    id: props.event?.id,
    title: title.value.trim(),
    description: description.value,
    date: new Date(`${dateStr.value}T00:00:00`)
  })
  open.value = false
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="isEdit ? 'Edit event' : 'Add movie night'"
    :description="isEdit ? 'Update the details for this screening.' : 'Schedule a new movie night.'"
  >
    <template #body>
      <div class="space-y-4">
        <UFormField label="Date" required>
          <UInput v-model="dateStr" type="date" class="w-full" />
        </UFormField>
        <UFormField label="Title" required>
          <UInput v-model="title" placeholder="e.g. Cult Classics Night" class="w-full" />
        </UFormField>
        <UFormField label="Description">
          <RichTextEditor v-model="description" />
        </UFormField>
      </div>
    </template>

    <template #footer>
      <div class="flex justify-end gap-2 w-full">
        <UButton label="Cancel" color="neutral" variant="ghost" @click="open = false" />
        <UButton :label="isEdit ? 'Save changes' : 'Add event'" :disabled="!canSave" @click="submit" />
      </div>
    </template>
  </UModal>
</template>
