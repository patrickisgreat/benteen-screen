<script setup lang="ts">
useHead({
  htmlAttrs: { lang: 'en' },
  link: [{ rel: 'icon', href: '/favicon.ico' }]
})

useSeoMeta({
  title: 'Benteen Screen On The Green',
  description: 'Movie-night voting. It Really Whips the Movie\'s Ass.',
  ogTitle: 'Benteen Screen On The Green',
  ogDescription: 'Vote on what plays at the next movie night.'
})
</script>

<template>
  <UApp>
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
