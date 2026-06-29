import { serverSupabaseServiceRole } from '#supabase/server'
import type { Database } from '~/types/database.types'

/**
 * Daily RSVP-reminder cron. Vercel Cron hits this (GET) once a day and
 * authenticates with the CRON_SECRET bearer token. For every reminders-enabled
 * upcoming event whose days-until matches a configured checkpoint
 * (`app_settings.reminder_days`), it emails the invitees who haven't RSVP'd yet
 * — reusing their one-click token links — throttled to at most once per
 * checkpoint, then stamps `reminded_at` and logs the batch in `comms_log`.
 *
 * Runs as the service role (no session): event_invites is admin-only and there's
 * no user here. The secret keeps the public route from being triggered by anyone.
 */
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)
  if (!config.cronSecret || getHeader(event, 'authorization') !== `Bearer ${config.cronSecret}`) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const { resendApiKey, resendFrom } = requireEmailConfig(event)
  const admin = serverSupabaseServiceRole<Database>(event)

  const { data: settings } = await admin.from('app_settings').select('reminder_days').eq('id', true).single()
  const reminderDays = settings?.reminder_days ?? [7, 3, 1]
  if (!reminderDays.length) return { ok: true, events: 0, sent: 0, note: 'reminders disabled' }

  const now = new Date()
  const horizon = new Date(now.getTime() + (Math.max(...reminderDays) + 1) * 86_400_000).toISOString()

  const { data: rows, error } = await admin
    .from('events')
    .select('id, title, event_date, reminders_enabled, event_invites(id, email, token, rsvp, sent_at, reminded_at)')
    .gte('event_date', now.toISOString())
    .lte('event_date', horizon)
  if (error) throw createError({ statusCode: 500, statusMessage: 'Could not load events', data: { cause: error.message } })

  // The events→event_invites relationship isn't declared in the generated types
  // (Relationships are empty), so PostgREST's embed infers an error type — cast to
  // the real shape, as the app composables do for their embeds.
  type EventRow = {
    id: string
    title: string
    event_date: string
    reminders_enabled: boolean
    event_invites: ReminderInvite[] | null
  }
  const due = selectDueReminders(
    ((rows ?? []) as unknown as EventRow[]).map(e => ({
      id: e.id, title: e.title, event_date: e.event_date, reminders_enabled: e.reminders_enabled, invites: e.event_invites ?? []
    })),
    now,
    reminderDays
  )

  const origin = resolveOrigin(event)
  const appUrl = `${origin}/overview`
  const stamp = now.toISOString()
  let totalSent = 0

  for (const d of due) {
    const items = d.invites.map((inv) => {
      const mail = buildEventReminderEmail({
        eventTitle: d.eventTitle,
        eventDate: formatEmailDate(d.eventDate) || null,
        daysLeft: d.daysLeft,
        rsvpUrl: `${origin}/rsvp?token=${inv.token}`,
        appUrl
      })
      return { to: inv.email, subject: mail.subject, html: mail.html, text: mail.text }
    })

    let ids: (string | null)[]
    try {
      ;({ ids } = await sendBatch(resendApiKey, resendFrom, items))
    } catch (e) {
      // A batch fails as a unit (e.g. an unverified sender). Leave reminded_at
      // untouched so the next run retries; don't fail the whole cron.
      console.error('[crons/reminders] batch failed -', e instanceof Error ? e.message : e)
      continue
    }

    // Stamp + log only the invites that actually went out (got a Resend id).
    const sentIds = d.invites.filter((_, i) => ids[i] != null).map(inv => inv.id)
    if (!sentIds.length) continue
    await admin.from('event_invites').update({ reminded_at: stamp }).in('id', sentIds)
    await admin.from('comms_log').insert({ event_id: d.eventId, kind: 'reminder', subject: `Reminder — ${d.eventTitle}`, recipient_count: sentIds.length })
    totalSent += sentIds.length
  }

  return { ok: true, events: due.length, sent: totalSent }
})
