<script setup lang="ts">
definePageMeta({ layout: false })

const { user } = useAuth()
const ctaTo = computed(() => (user.value ? '/overview' : '/login'))

const features = [
  {
    icon: 'i-lucide-search',
    title: 'Suggest',
    description: 'Search the full movie catalog and nominate a film for the next screening.'
  },
  {
    icon: 'i-lucide-heart',
    title: 'Vote',
    description: 'Back the films you want to watch. The most-loved suggestion wins the night.'
  },
  {
    icon: 'i-lucide-popcorn',
    title: 'Gather',
    description: 'Show up, grab a seat on the green, and enjoy what the group chose together.'
  }
]
</script>

<template>
  <div class="min-h-screen flex flex-col bg-gradient-to-b from-primary-500/10 via-default to-default">
    <header class="absolute inset-x-0 top-0">
      <UContainer class="flex items-center justify-end gap-2 py-4">
        <UColorModeButton />
        <UButton
          :to="ctaTo"
          :label="user ? 'Open app' : 'Sign in'"
          color="neutral"
          variant="ghost"
        />
      </UContainer>
    </header>

    <main class="flex-1 flex items-center">
      <UContainer class="py-20">
        <div class="max-w-2xl mx-auto text-center flex flex-col items-center gap-6">
          <img
            src="/img/bsotg_logo.svg"
            alt="Benteen Screen On The Green"
            class="w-72 max-w-full"
          >
          <h1 class="text-4xl sm:text-5xl font-bold tracking-tight text-balance">
            Movie night, decided by the people.
          </h1>
          <p class="text-lg text-muted text-pretty">
            Suggest a film, vote on the lineup, and let the group pick what plays
            on the green. It really whips the movie's ass.
          </p>
          <div class="flex flex-wrap items-center justify-center gap-3">
            <UButton
              :to="ctaTo"
              label="Get started"
              size="xl"
              trailing-icon="i-lucide-arrow-right"
            />
            <UButton
              to="/about"
              label="Learn more"
              size="xl"
              color="neutral"
              variant="subtle"
            />
          </div>
        </div>

        <div class="mt-20 grid gap-6 sm:grid-cols-3 max-w-4xl mx-auto">
          <UCard
            v-for="feature in features"
            :key="feature.title"
            variant="subtle"
          >
            <div class="flex flex-col gap-2">
              <UIcon :name="feature.icon" class="size-7 text-primary" />
              <h3 class="font-semibold text-lg">
                {{ feature.title }}
              </h3>
              <p class="text-sm text-muted">
                {{ feature.description }}
              </p>
            </div>
          </UCard>
        </div>
      </UContainer>
    </main>
  </div>
</template>
