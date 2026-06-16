import { Resend } from 'resend'

/** Escape user-supplied text before it goes into email HTML (no injection). */
export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export interface BuiltEmail {
  subject: string
  html: string
  text: string
}

/** Human-readable date for email bodies (server-side; no app auto-imports here). */
export function formatEmailDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}

/** Normalize, lowercase, and de-duplicate a recipient list. */
export function uniqueEmails(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>()
  for (const value of values) {
    const email = value?.trim().toLowerCase()
    if (email) seen.add(email)
  }
  return [...seen]
}

function shell(bodyHtml: string): string {
  return `<div style="font-family:ui-sans-serif,system-ui,sans-serif;max-width:560px;margin:0 auto;color:#1f2937;line-height:1.5">${bodyHtml}</div>`
}

function ctaButton(label: string, link: string): string {
  return `<a href="${escapeHtml(link)}" style="display:inline-block;background:#16a34a;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600">${escapeHtml(label)}</a>`
}

/** "Come join us" invite to a new person (adds nothing — the route does the allowlisting). */
export function buildInviteEmail(opts: {
  inviterName: string | null
  link: string
  eventTitle?: string | null
  eventDate?: string | null
}): BuiltEmail {
  const inviter = opts.inviterName ? escapeHtml(opts.inviterName) : 'A member'
  const eventLine = opts.eventTitle
    ? `<p>First up: <strong>${escapeHtml(opts.eventTitle)}</strong>${opts.eventDate ? ` on ${escapeHtml(opts.eventDate)}` : ''}.</p>`
    : ''
  const subject = `${inviter} invited you to Benteen Screen On The Green`
  const html = shell(
    `<h1 style="font-size:20px;margin:0 0 12px">You're invited to movie night 🎬</h1>`
    + `<p>${inviter} added you to <strong>Benteen Screen On The Green</strong> — a group movie-night voting app. It Really Whips the Movie's Ass.</p>`
    + eventLine
    + `<p style="margin:20px 0">${ctaButton('Sign in to join', opts.link)}</p>`
    + `<p style="font-size:13px;color:#6b7280">Sign in with the email this was sent to. If you weren't expecting this, you can ignore it.</p>`
  )
  const text = `${inviter} invited you to Benteen Screen On The Green — a group movie-night voting app.`
    + (opts.eventTitle ? `\n\nFirst up: ${opts.eventTitle}${opts.eventDate ? ` on ${opts.eventDate}` : ''}.` : '')
    + `\n\nSign in to join: ${opts.link}`
  return { subject, html, text }
}

/** Admin announcement / reminder blast about a specific event. */
export function buildAnnounceEmail(opts: {
  eventTitle: string
  eventDate: string | null
  message: string
  link: string
  subject?: string
}): BuiltEmail {
  const subject = opts.subject?.trim() || `${opts.eventTitle} — Benteen Screen On The Green`
  // The admin message is plain text; escape it and preserve line breaks.
  const messageHtml = escapeHtml(opts.message).replace(/\n/g, '<br>')
  const html = shell(
    `<h1 style="font-size:20px;margin:0 0 4px">${escapeHtml(opts.eventTitle)}</h1>`
    + (opts.eventDate ? `<p style="color:#6b7280;margin:0 0 16px">${escapeHtml(opts.eventDate)}</p>` : '')
    + `<p>${messageHtml}</p>`
    + `<p style="margin:20px 0">${ctaButton('View on Benteen Screen', opts.link)}</p>`
  )
  const text = `${opts.eventTitle}${opts.eventDate ? ` — ${opts.eventDate}` : ''}\n\n${opts.message}\n\n${opts.link}`
  return { subject, html, text }
}

/** Evite-style per-event invitation with one-click RSVP buttons. The buttons
 *  link to the public /rsvp page (token in the query), which records the reply
 *  without requiring sign-in. */
export function buildEventInviteEmail(opts: {
  eventTitle: string
  eventDate: string | null
  location: string | null
  inviterName: string | null
  rsvpUrl: string // base: https://site/rsvp?token=abc
}): BuiltEmail {
  const inviter = opts.inviterName ? escapeHtml(opts.inviterName) : 'Your host'
  const rsvp = (status: string, label: string, color: string): string =>
    `<a href="${escapeHtml(`${opts.rsvpUrl}&status=${status}`)}" style="display:inline-block;background:${color};color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:600;margin:0 6px 6px 0">${escapeHtml(label)}</a>`
  const subject = `You're invited: ${opts.eventTitle}`
  const html = shell(
    `<h1 style="font-size:20px;margin:0 0 8px">You're invited to ${escapeHtml(opts.eventTitle)} 🎬</h1>`
    + (opts.eventDate ? `<p style="color:#6b7280;margin:0 0 4px">${escapeHtml(opts.eventDate)}${opts.location ? ` · ${escapeHtml(opts.location)}` : ''}</p>` : '')
    + `<p>${inviter} hopes you can make it for movie night. Will you be there?</p>`
    + `<p style="margin:20px 0">${rsvp('going', 'I\'m going', '#16a34a')}${rsvp('maybe', 'Maybe', '#d97706')}${rsvp('no', 'Can\'t make it', '#6b7280')}</p>`
  )
  const text = `You're invited: ${opts.eventTitle}${opts.eventDate ? ` — ${opts.eventDate}` : ''}`
    + `\n\nRSVP:\nGoing: ${opts.rsvpUrl}&status=going\nMaybe: ${opts.rsvpUrl}&status=maybe\nCan't make it: ${opts.rsvpUrl}&status=no`
  return { subject, html, text }
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
