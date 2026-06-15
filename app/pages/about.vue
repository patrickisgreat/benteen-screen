<script setup lang="ts">
useSeoMeta({ title: 'About · BSOTG' })

const steps = [
  { icon: 'i-lucide-calendar', title: 'A night gets scheduled', text: 'An organizer adds an upcoming movie night with a date and a theme.' },
  { icon: 'i-lucide-search', title: 'Anyone suggests a film', text: 'Search the catalog and nominate movies you want everyone to watch.' },
  { icon: 'i-lucide-heart', title: 'The group votes', text: 'Vote on the suggestions. The film with the most love rises to the top.' },
  { icon: 'i-lucide-popcorn', title: 'Movie night happens', text: 'The top pick screens on the green. Bring a blanket.' }
]
</script>

<template>
  <UContainer class="py-12 max-w-3xl">
    <h1 class="text-3xl font-bold">
      About Benteen Screen On The Green
    </h1>
    <p class="mt-4 text-muted text-lg">
      BSOTG is a tiny app for deciding what to watch together. Instead of endless
      group-chat debate, everyone suggests films and votes — and the crowd
      favorite plays at the next outdoor screening.
    </p>

    <div class="mt-10 grid gap-4 sm:grid-cols-2">
      <UCard
        v-for="step in steps"
        :key="step.title"
        variant="subtle"
      >
        <div class="flex items-start gap-3">
          <UIcon :name="step.icon" class="size-6 text-primary shrink-0 mt-0.5" />
          <div>
            <h2 class="font-semibold">
              {{ step.title }}
            </h2>
            <p class="text-sm text-muted mt-1">
              {{ step.text }}
            </p>
          </div>
        </div>
      </UCard>
    </div>

    <div class="mt-10">
      <UButton to="/overview" label="Go to the app" trailing-icon="i-lucide-arrow-right" />
    </div>
  </UContainer>
</template>
