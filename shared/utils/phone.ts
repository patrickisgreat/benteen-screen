/** Phone-number helpers for texting guests. Numbers are stored in E.164
 *  (`+15551234567`) so one guest never ends up with two spellings and the
 *  `sms:` link always dials. US is the assumed country for bare 10-digit input —
 *  this is a neighborhood movie night. Pure, so the rules are unit-testable. */

const E164 = /^\+[1-9]\d{6,14}$/

/** Coerce what a person typed ("(555) 123-4567", "555.123.4567", "+44 20 7946
 *  0958") into E.164, or null when it can't be a dialable number. */
export function normalizePhone(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  const international = trimmed.startsWith('+')
  const digits = trimmed.replace(/\D/g, '')
  if (international) {
    const candidate = `+${digits}`
    return E164.test(candidate) ? candidate : null
  }
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  return null
}

/** Human-readable form for display: US numbers as (555) 123-4567, anything
 *  else as stored. */
export function formatPhone(e164: string): string {
  const match = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164)
  if (!match) return e164
  return `(${match[1]}) ${match[2]}-${match[3]}`
}
