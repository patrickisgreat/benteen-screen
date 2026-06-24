<script setup lang="ts">
/** The admin event selector: a USelectMenu bound to an event id, used to scope
 *  each admin tab to one event. */
const model = defineModel<string>()
defineProps<{ items: { label: string, value: string }[] }>()
</script>

<template>
  <USelectMenu
    v-model="model"
    :items="items"
    value-key="value"
    :search-input="false"
    placeholder="Select an event"
    class="w-full sm:max-w-sm mb-4"
  />
</template>
