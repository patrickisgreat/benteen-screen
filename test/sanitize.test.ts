// @vitest-environment jsdom
// DOMPurify's canonical non-browser environment is jsdom; in production this
// runs in a real browser (ssr: false).
import { describe, expect, it } from 'vitest'
import { sanitizeHtml } from '../app/utils/sanitize'

describe('sanitizeHtml', () => {
  it('returns an empty string for nullish input', () => {
    expect(sanitizeHtml(null)).toBe('')
    expect(sanitizeHtml(undefined)).toBe('')
    expect(sanitizeHtml('')).toBe('')
  })

  it('strips <script> tags (XSS — Product Invariant 5)', () => {
    const dirty = '<p>Movie night!</p><script>alert(1)</script>'
    const clean = sanitizeHtml(dirty)
    expect(clean).toContain('<p>Movie night!</p>')
    expect(clean).not.toContain('<script>')
    expect(clean.toLowerCase()).not.toContain('alert(1)')
  })

  it('strips inline event handlers', () => {
    const clean = sanitizeHtml('<img src="x" onerror="alert(1)">')
    expect(clean.toLowerCase()).not.toContain('onerror')
  })

  it('keeps safe formatting tags and links', () => {
    const clean = sanitizeHtml('<p><strong>Bold</strong> and <a href="https://example.com">link</a></p>')
    expect(clean).toContain('<strong>Bold</strong>')
    expect(clean).toContain('href="https://example.com"')
  })

  it('removes javascript: URLs', () => {
    const clean = sanitizeHtml('<a href="javascript:alert(1)">x</a>')
    expect(clean.toLowerCase()).not.toContain('javascript:')
  })
})
