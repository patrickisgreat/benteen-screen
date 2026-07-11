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
  let totalSent = 0
  const digest: AdminReminderDigestItem[] = []

  for (const d of due) {
    const eventDate = formatEmailDate(d.eventDate) || null
    const { sent, failed, error } = await sendEventReminders(admin, {
      apiKey: resendApiKey,
      from: resendFrom,
      eventTitle: d.eventTitle,
      eventDate,
      daysLeft: d.daysLeft,
      origin,
      appUrl,
      invites: d.invites
    })
    // Log the outcome of every attempt — including a total failure (sent = 0) —
    // so the admin Comms log shows what the automated run actually did.
    await admin.from('comms_log').insert({
      event_id: d.eventId,
      kind: 'reminder',
      subject: `Reminder — ${d.eventTitle}`,
      recipient_count: sent,
      failed_count: failed,
      status: commsStatus(sent, failed),
      error
    })
    if (sent > 0) {
      totalSent += sent
      digest.push({ eventTitle: d.eventTitle, eventDate, daysLeft: d.daysLeft, remindedCount: sent })
    }
  }

  // Notify admins of the automated send they don't otherwise see. Best-effort:
  // the reminders already went out, so a digest failure must not fail the cron.
  let notified = 0
  if (totalSent > 0) {
    try {
      ;({ notified } = await sendAdminReminderDigest(admin, {
        apiKey: resendApiKey,
        from: resendFrom,
        items: digest,
        totalReminded: totalSent,
        adminUrl: `${origin}/admin`
      }))
    } catch (e) {
      console.error('[crons/reminders] admin digest failed -', e instanceof Error ? e.message : e)
    }
  }

  return { ok: true, events: due.length, sent: totalSent, adminsNotified: notified }
})
