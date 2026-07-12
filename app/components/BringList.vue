<script setup lang="ts">
import type { BringItem } from '#shared/types/bring'

// `manage` = admin curation (add + edit + remove any item); otherwise it's the
// public view: volunteer for an open slot, unclaim your own, add a custom item
// you're bringing, or remove an item you added (unless someone else claimed it).
defineProps<{ items: BringItem[], manage?: boolean }>()
const emit = defineEmits<{
  add: [label: string]
  claim: [item: BringItem]
  unclaim: [item: BringItem]
  update: [item: BringItem, label: string]
  remove: [item: BringItem]
}>()

const { myId } = useAuth()
const newItem = ref('')
const editingId = ref<string | null>(null)
const draft = ref('')

function add(): void {
  const label = newItem.value.trim()
  if (!label) return
  emit('add', label)
  newItem.value = ''
}

function startEdit(item: BringItem): void {
  editingId.value = item.id
  draft.value = item.label
}
function cancelEdit(): void {
  editingId.value = null
  draft.value = ''
}
function saveEdit(item: BringItem): void {
  const label = draft.value.trim()
  if (label && label !== item.label) emit('update', item, label)
  cancelEdit()
}

function mine(item: BringItem): boolean {
  return Boolean(item.user_id) && item.user_id === myId.value
}

// You may retract an item you added, but not out from under someone else's claim.
function removableByMe(item: BringItem): boolean {
  return item.created_by === myId.value && (!item.user_id || item.user_id === myId.value)
}
</script>

<template>
  <div class="space-y-3">
    <ul v-if="items.length" class="divide-y divide-default rounded-lg ring ring-default overflow-hidden">
      <li v-for="item in items" :key="item.id" class="flex items-center gap-2 p-3">
        <UIcon
          :name="item.user_id ? 'i-lucide-circle-check' : 'i-lucide-circle-dashed'"
          :class="item.user_id ? 'text-primary' : 'text-muted'"
          class="shrink-0"
        />
        <div class="min-w-0 flex-1">
          <UInput
            v-if="manage && editingId === item.id"
            v-model="draft"
            size="sm"
            autofocus
            class="w-full"
            @keydown.enter="saveEdit(item)"
            @keydown.esc="cancelEdit"
          />
          <template v-else>
            <p class="font-medium truncate">
              {{ item.label }}
            </p>
            <p class="text-xs text-muted truncate">
              {{ item.user_id ? (item.bringer?.display_name ?? 'Someone') : 'Open — needs a volunteer' }}
            </p>
          </template>
        </div>

        <!-- Public claim view -->
        <template v-if="!manage">
          <UButton v-if="!item.user_id" label="I'll bring it" size="xs" class="shrink-0" @click="emit('claim', item)" />
          <UButton v-else-if="mine(item)" label="Unclaim" size="xs" color="neutral" variant="ghost" class="shrink-0" @click="emit('unclaim', item)" />
          <UButton
            v-if="removableByMe(item)"
            icon="i-lucide-trash-2"
            size="xs"
            color="neutral"
            variant="ghost"
            class="shrink-0"
            aria-label="Remove item"
            @click="emit('remove', item)"
          />
        </template>

        <!-- Admin curation: edit / remove an item -->
        <template v-else-if="editingId === item.id">
          <UButton icon="i-lucide-check" size="xs" color="primary" variant="ghost" class="shrink-0" aria-label="Save item" @click="saveEdit(item)" />
          <UButton icon="i-lucide-x" size="xs" color="neutral" variant="ghost" class="shrink-0" aria-label="Cancel edit" @click="cancelEdit" />
        </template>
        <template v-else>
          <UButton icon="i-lucide-pencil" size="xs" color="neutral" variant="ghost" class="shrink-0" aria-label="Edit item" @click="startEdit(item)" />
          <UButton icon="i-lucide-trash-2" size="xs" color="neutral" variant="ghost" class="shrink-0" aria-label="Remove item" @click="emit('remove', item)" />
        </template>
      </li>
    </ul>
    <p v-else class="text-sm text-muted">
      {{ manage ? 'Nothing on the list yet — add what the group needs.' : 'Nothing to bring yet — add something below.' }}
    </p>

    <!-- Add an item: admins curate open slots; members add what they're bringing -->
    <div class="flex gap-2">
      <UInput
        v-model="newItem"
        :placeholder="manage ? 'e.g. pepperoni, drinks, plates…' : 'Bringing something else? e.g. brownies'"
        class="flex-1"
        @keydown.enter="add"
      />
      <UButton label="Add" icon="i-lucide-plus" :disabled="!newItem.trim()" @click="add" />
    </div>
  </div>
</template>
