<script setup lang="ts">
import type { BringItem } from '#shared/types/bring'

defineProps<{ items: BringItem[], doughs?: number }>()
const emit = defineEmits<{
  add: [label: string]
  claim: [item: BringItem]
  unclaim: [item: BringItem]
  remove: [item: BringItem]
}>()

const { myId, isAdmin } = useAuth()
const newItem = ref('')

function add(): void {
  const label = newItem.value.trim()
  if (!label) return
  emit('add', label)
  newItem.value = ''
}

function mine(item: BringItem): boolean {
  return Boolean(item.user_id) && item.user_id === myId.value
}
</script>

<template>
  <div class="space-y-3">
    <div v-if="doughs !== undefined" class="text-sm font-medium flex items-center gap-1.5">
      🍕 {{ doughs }} pizza dough{{ doughs === 1 ? '' : 's' }} needed
      <span class="text-xs text-muted font-normal">(one per "Going")</span>
    </div>

    <ul v-if="items.length" class="divide-y divide-default rounded-lg ring ring-default overflow-hidden">
      <li v-for="item in items" :key="item.id" class="flex items-center gap-2 p-3">
        <UIcon
          :name="item.user_id ? 'i-lucide-circle-check' : 'i-lucide-circle-dashed'"
          :class="item.user_id ? 'text-primary' : 'text-muted'"
          class="shrink-0"
        />
        <div class="min-w-0 flex-1">
          <p class="font-medium truncate">
            {{ item.label }}
          </p>
          <p class="text-xs text-muted truncate">
            {{ item.user_id ? (item.bringer?.display_name ?? 'Someone') : 'Open — needs a volunteer' }}
          </p>
        </div>
        <UButton v-if="!item.user_id" label="I'll bring it" size="xs" class="shrink-0" @click="emit('claim', item)" />
        <UButton v-else-if="mine(item)" label="Unclaim" size="xs" color="neutral" variant="ghost" class="shrink-0" @click="emit('unclaim', item)" />
        <UButton
          v-if="mine(item) || isAdmin"
          icon="i-lucide-trash-2"
          size="xs"
          color="neutral"
          variant="ghost"
          class="shrink-0"
          aria-label="Remove item"
          @click="emit('remove', item)"
        />
      </li>
    </ul>
    <p v-else class="text-sm text-muted">
      Nothing on the list yet — add what you're bringing.
    </p>

    <div class="flex gap-2">
      <UInput v-model="newItem" placeholder="e.g. toppings, drinks, a blanket…" class="flex-1" @keydown.enter="add" />
      <UButton label="Add" icon="i-lucide-plus" :disabled="!newItem.trim()" @click="add" />
    </div>
  </div>
</template>
