import { Resend } from 'resend'
import type { H3Event } from 'h3'

// The email *builders* (subject/html/text) live in shared/utils/email.ts so the
// admin UI can render a live preview with the exact same output. This server-only
// module keeps the Resend send wrapper + the config/origin helpers its routes
// share (the API key must never reach the client).

/** The origin for links in emails: the configured canonical URL, else the request's. */
export function resolveOrigin(event: H3Event): string {
  const { siteUrl } = useRuntimeConfig(event)
  return siteUrl || getRequestURL(event).origin
}

/**
 * Resolves the Resend config, throwing a 500 when no API key is set. Routes that
 * intentionally soft-degrade on a missing key (e.g. invite-a-friend still
 * allowlists the email) should read the config directly instead.
 */
export function requireEmailConfig(event: H3Event): { resendApiKey: string, resendFrom: string } {
  const { resendApiKey, resendFrom } = useRuntimeConfig(event)
  if (!resendApiKey) throw createError({ statusCode: 500, statusMessage: 'Email is not configured' })
  return { resendApiKey, resendFrom }
}

export interface SendParams {
  to: string | string[]
  bcc?: string[]
  subject: string
  html: string
  text: string
  replyTo?: string
}

/** Thin Resend wrapper — throws on failure so callers map it to an HTTP error.
 *  Returns the Resend message id so callers can correlate webhook events. */
export async function sendEmail(apiKey: string, from: string, params: SendParams): Promise<{ id: string | null }> {
  const resend = new Resend(apiKey)
  const { data, error } = await resend.emails.send({
    from,
    to: params.to,
    bcc: params.bcc,
    subject: params.subject,
    html: params.html,
    text: params.text,
    replyTo: params.replyTo
  })
  if (error) throw new Error(error.message || 'Failed to send email')
  return { id: data?.id ?? null }
}
