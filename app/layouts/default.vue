<script setup lang="ts">
import type { DropdownMenuItem, NavigationMenuItem } from '@nuxt/ui'

const { account, isAdmin, signOutUser } = useAuth()

const links = computed<NavigationMenuItem[]>(() => {
  const items: NavigationMenuItem[] = [
    { label: 'Overview', to: '/overview', icon: 'i-lucide-clapperboard' }
  ]
  if (isAdmin.value) {
    items.push({ label: 'Admin', to: '/admin', icon: 'i-lucide-shield' })
  }
  return items
})

const userMenu = computed<DropdownMenuItem[][]>(() => [
  [{ label: account.value?.displayName ?? 'Signed in', type: 'label' as const, avatar: { src: account.value?.avatarUrl ?? undefined } }],
  [
    { label: 'Profile', icon: 'i-lucide-user', to: '/profile' },
    ...(isAdmin.value ? [{ label: 'Admin', icon: 'i-lucide-shield', to: '/admin' }] : [])
  ],
  [{ label: 'Sign out', icon: 'i-lucide-log-out', color: 'error' as const, onSelect: () => handleSignOut() }]
])

async function handleSignOut(): Promise<void> {
  await signOutUser()
  await navigateTo('/')
}
</script>

<template>
  <div>
    <UHeader to="/overview" :ui="{ center: 'gap-1' }">
      <template #title>
        <img src="/img/logo.png" alt="Benteen Screen On The Green" class="h-7 w-auto">
      </template>

      <UNavigationMenu :items="links" />

      <template #right>
        <UColorModeButton />

        <UDropdownMenu
          v-if="account"
          :items="userMenu"
          :content="{ align: 'end' }"
        >
          <UButton
            variant="ghost"
            color="neutral"
            trailing-icon="i-lucide-chevron-down"
            class="gap-2"
          >
            <UAvatar
              :src="account.avatarUrl ?? undefined"
              :alt="account.displayName ?? 'User'"
              size="2xs"
            />
            <span class="hidden sm:inline max-w-32 truncate">{{ account.displayName }}</span>
          </UButton>
        </UDropdownMenu>

        <UButton
          v-else
          to="/login"
          label="Sign in"
          color="primary"
        />
      </template>

      <template #body>
        <UNavigationMenu :items="links" orientation="vertical" class="-mx-2.5" />
      </template>
    </UHeader>

    <UMain>
      <slot />
    </UMain>
  </div>
</template>
