<script setup lang="ts">
import type { OnlineUser } from '~/composables/usePresence'

const props = defineProps<{ online: OnlineUser[] }>()
const open = ref(false)

const MAX_SHOWN = 4
const count = computed(() => props.online.length)
// Nothing to show until presence has synced (you'll always be in it once it has).
const hasAnyone = computed(() => count.value > 0)
</script>

<template>
  <div v-if="hasAnyone">
    <button
      type="button"
      class="inline-flex items-center gap-2 rounded-full px-2 py-1 hover:bg-elevated/60 transition-colors cursor-pointer"
      :aria-label="`${count} watching now — see who's online`"
      @click="open = true"
    >
      <span class="relative flex size-2 shrink-0">
        <span class="absolute inline-flex size-full animate-ping rounded-full bg-green-500 opacity-75" />
        <span class="relative inline-flex size-2 rounded-full bg-green-500" />
      </span>
      <UAvatarGroup :max="MAX_SHOWN" size="2xs">
        <UAvatar
          v-for="u in online"
          :key="u.id"
          :src="u.avatar ?? undefined"
          :alt="u.name"
        />
      </UAvatarGroup>
      <span class="text-sm text-muted whitespace-nowrap">{{ count }} watching</span>
    </button>

    <UModal v-model:open="open" title="Who's online">
      <template #body>
        <ul class="space-y-3">
          <li v-for="u in online" :key="u.id" class="flex items-center gap-3">
            <UAvatar :src="u.avatar ?? undefined" :alt="u.name" size="sm" />
            <span class="font-medium truncate">{{ u.name }}</span>
          </li>
        </ul>
      </template>
    </UModal>
  </div>
</template>
