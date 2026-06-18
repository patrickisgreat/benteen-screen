// @vitest-environment nuxt
import { describe, expect, it } from 'vitest'
import type { H3Event } from 'h3'
import { requireEmailConfig } from '../server/utils/email'

// server/utils/email.ts has no `#supabase/server` dependency, so it loads in the
// Nuxt env. The test runtime has no Resend key configured, which is exactly the
// guard's failure case — assert it throws the shared 500 rather than returning.
const fakeEvent = {} as H3Event

describe('requireEmailConfig', () => {
  it('throws a 500 when no Resend API key is configured', () => {
    expect(() => requireEmailConfig(fakeEvent)).toThrowError(expect.objectContaining({ statusCode: 500 }))
  })
})
