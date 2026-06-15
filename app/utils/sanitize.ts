import DOMPurify from 'dompurify'

/**
 * Sanitize stored rich-text (event descriptions) before rendering with v-html.
 * Event descriptions are admin-authored, but rendering raw stored HTML is still
 * an XSS foot-gun (Product Invariant 5) — never bypass this.
 */
export function sanitizeHtml(html: string | null | undefined): string {
  if (!html) return ''
  // The app is client-only (ssr: false); guard anyway so this is never a no-op trap.
  if (import.meta.server) return ''
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    ALLOWED_ATTR: ['href', 'target', 'rel', 'class', 'style'],
    ADD_ATTR: ['target']
  })
}
