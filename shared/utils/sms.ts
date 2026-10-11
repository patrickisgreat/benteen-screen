import { firstName } from './email'

/** Building the text message the host sends from their own phone. Nothing here
 *  talks to a carrier: `buildSmsHref` makes an `sms:` link that opens Messages
 *  pre-addressed and pre-filled, and the host taps send. */

/** Placeholders the host can use in the per-event text template. */
export const TEXT_PLACEHOLDERS = ['name', 'event', 'date', 'link'] as const
export type TextPlaceholder = (typeof TEXT_PLACEHOLDERS)[number]
export type TextVars = Record<TextPlaceholder, string>

/** Short on purpose — it's a text, and the host personalizes it per person. */
export const DEFAULT_TEXT_TEMPLATE
  = 'Hey {name}! Movie night on the green: {event}, {date}. Can you make it? RSVP here: {link}'

/** Fill `{name}` / `{event}` / `{date}` / `{link}` in a template. Unknown braces
 *  are left alone so a stray "{" in the host's wording doesn't vanish. */
export function renderTextTemplate(template: string, vars: TextVars): string {
  return template.replace(/\{(name|event|date|link)\}/g, (_, key: TextPlaceholder) => vars[key])
}

/** How to address someone in a text: their first name (the email helper's rule),
 *  else the part of their email before the @ — "sam.b" is still friendlier than
 *  the whole address, and a text with no name at all reads like spam. */
export function textName(displayName: string | null, email: string): string {
  return firstName(displayName) ?? email.split('@')[0] ?? email
}

/** An `sms:` link to one or more recipients with a pre-filled body.
 *
 *  The query is `?&body=` deliberately: Android's Messages reads `?body=`,
 *  while iOS historically reads `&body=` — `?&body=` satisfies both (iOS sees
 *  an `&`-delimited body, Android sees a query whose first parameter is empty).
 *  Multiple recipients are comma-separated, which both platforms open as a
 *  group conversation. */
export function buildSmsHref(recipients: readonly string[], body: string): string {
  return `sms:${recipients.join(',')}?&body=${encodeURIComponent(body)}`
}
