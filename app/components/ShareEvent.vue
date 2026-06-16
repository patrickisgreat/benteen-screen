<script setup lang="ts">
import type { MovieEvent } from '#shared/types/event'

// Share an event to social media to drum up invitees. Access is still
// allowlist-gated — sharing spreads the word; "Invite a friend" grants access.
const props = defineProps<{ event: MovieEvent }>()
const toast = useToast()

const shareUrl = computed(() => (import.meta.client ? window.location.origin : ''))
const shareText = computed(() =>
  `Join us for ${props.event.title}${props.event.event_date ? ` on ${formatDate(props.event.event_date)}` : ''} at Benteen Screen On The Green! 🎬`
)

const canNativeShare = computed(() =>
  import.meta.client && typeof navigator !== 'undefined' && typeof navigator.share === 'function'
)

const networks = computed(() => {
  const u = encodeURIComponent(shareUrl.value)
  const t = encodeURIComponent(shareText.value)
  return [
    { label: 'Facebook', icon: 'i-simple-icons-facebook', href: `https://www.facebook.com/sharer/sharer.php?u=${u}&quote=${t}` },
    { label: 'X', icon: 'i-simple-icons-x', href: `https://twitter.com/intent/tweet?text=${t}&url=${u}` },
    { label: 'WhatsApp', icon: 'i-simple-icons-whatsapp', href: `https://wa.me/?text=${t}%20${u}` },
    { label: 'Email', icon: 'i-lucide-mail', href: `mailto:?subject=${encodeURIComponent(props.event.title)}&body=${t}%20${u}` }
  ]
})

async function nativeShare(): Promise<void> {
  try {
    await navigator.share({ title: props.event.title, text: shareText.value, url: shareUrl.value })
  } catch {
    // Cancelled or unsupported — fall back to the per-network buttons.
  }
}

async function copyLink(): Promise<void> {
  try {
    await navigator.clipboard.writeText(`${shareText.value} ${shareUrl.value}`)
    toast.add({ title: 'Link copied', icon: 'i-lucide-check', color: 'success' })
  } catch {
    toast.add({ title: 'Could not copy the link', color: 'error' })
  }
}
</script>

<template>
  <div class="flex flex-wrap items-center gap-2">
    <UButton
      v-if="canNativeShare"
      label="Share"
      icon="i-lucide-share-2"
      size="sm"
      color="neutral"
      variant="outline"
      @click="nativeShare"
    />
    <UButton
      v-for="network in networks"
      :key="network.label"
      :icon="network.icon"
      :to="network.href"
      target="_blank"
      rel="noopener"
      size="sm"
      color="neutral"
      variant="outline"
      :aria-label="`Share on ${network.label}`"
    />
    <UButton label="Copy link" icon="i-lucide-link" size="sm" color="neutral" variant="ghost" @click="copyLink" />
  </div>
</template>
