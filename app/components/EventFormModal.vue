<script setup lang="ts">
import type { MovieEvent } from '#shared/types/event'

interface SavePayload {
  id?: string
  title: string
  description: string
  date: Date
  startTime: string | null
  location: string | null
  locationUrl: string | null
  posterUrl: string | null
}

const open = defineModel<boolean>('open', { default: false })
const props = defineProps<{ event?: MovieEvent | null }>()
const emit = defineEmits<{ save: [payload: SavePayload] }>()

const toast = useToast()
const { uploadPoster } = useEventAdmin()

const title = ref('')
const description = ref('')
const dateStr = ref('')
const startTime = ref('')
const location = ref('')
const locationUrl = ref('')
const posterUrl = ref<string | null>(null)
const uploading = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)

const isEdit = computed(() => Boolean(props.event))
const canSave = computed(() => title.value.trim().length > 0 && dateStr.value.length > 0)

// Reset / hydrate the form each time the modal opens.
watch(open, (isOpen) => {
  if (!isOpen) return
  if (props.event) {
    title.value = props.event.title
    description.value = props.event.description ?? ''
    const date = toDate(props.event.event_date)
    dateStr.value = toInputDate(date ?? new Date())
    startTime.value = props.event.start_time ?? ''
    location.value = props.event.location ?? ''
    locationUrl.value = props.event.location_url ?? ''
    posterUrl.value = props.event.poster_url ?? null
  } else {
    title.value = ''
    description.value = ''
    dateStr.value = toInputDate(new Date())
    startTime.value = ''
    location.value = ''
    locationUrl.value = ''
    posterUrl.value = null
  }
})

async function onFileChange(e: Event): Promise<void> {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  if (!file.type.startsWith('image/')) {
    toast.add({ title: 'Pick an image file', color: 'warning' })
    return
  }
  uploading.value = true
  try {
    posterUrl.value = await uploadPoster(file)
  } catch {
    toast.add({ title: 'Poster upload failed', color: 'error' })
  } finally {
    uploading.value = false
    if (fileInput.value) fileInput.value.value = ''
  }
}

function submit(): void {
  if (!canSave.value) return
  emit('save', {
    id: props.event?.id,
    title: title.value.trim(),
    description: description.value,
    date: new Date(`${dateStr.value}T00:00:00`),
    startTime: startTime.value.trim() || null,
    location: location.value.trim() || null,
    locationUrl: locationUrl.value.trim() || null,
    posterUrl: posterUrl.value
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

        <div class="grid sm:grid-cols-2 gap-4">
          <UFormField label="Start time" hint="optional">
            <UInput v-model="startTime" placeholder="e.g. 7:30 PM" class="w-full" />
          </UFormField>
          <UFormField label="Location" hint="optional">
            <UInput v-model="location" placeholder="e.g. Benteen Park" class="w-full" />
          </UFormField>
        </div>
        <UFormField label="Map / location link" hint="optional">
          <UInput v-model="locationUrl" type="url" placeholder="https://maps.google.com/…" class="w-full" />
        </UFormField>

        <UFormField label="Event poster" hint="optional">
          <div class="flex items-center gap-3">
            <div
              v-if="posterUrl"
              class="size-16 rounded-lg bg-cover bg-center ring ring-default shrink-0"
              :style="{ backgroundImage: `url(${posterUrl})` }"
            />
            <div class="flex gap-2">
              <UButton
                :label="posterUrl ? 'Replace' : 'Upload poster'"
                icon="i-lucide-image-up"
                color="neutral"
                variant="outline"
                :loading="uploading"
                @click="fileInput?.click()"
              />
              <UButton
                v-if="posterUrl"
                label="Remove"
                color="neutral"
                variant="ghost"
                @click="posterUrl = null"
              />
            </div>
            <input ref="fileInput" type="file" accept="image/*" class="hidden" @change="onFileChange">
          </div>
        </UFormField>

        <UFormField label="Description">
          <RichTextEditor v-model="description" />
        </UFormField>
      </div>
    </template>

    <template #footer>
      <div class="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 w-full">
        <UButton label="Cancel" color="neutral" variant="ghost" class="justify-center" @click="open = false" />
        <UButton :label="isEdit ? 'Save changes' : 'Add event'" class="justify-center" :disabled="!canSave || uploading" @click="submit" />
      </div>
    </template>
  </UModal>
</template>
