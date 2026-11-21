import { logger } from './logger'

/**
 * Sends email through Resend's HTTP API (https://resend.com/docs/api-reference/emails/send-email).
 * HTTP rather than SMTP because Render's free instances block outbound SMTP
 * ports. No SDK: one fetch.
 *
 * Configured by:
 *   RESEND_API_KEY  — without it nothing is sent (logged once), nothing fails
 *   MAIL_FROM       — "StreamVault <premium@stream-vault.site>" by default;
 *                     the domain must be verified in Resend
 *   MAIL_REPLY_TO   — optional address replies go to
 */

const RESEND_URL = 'https://api.resend.com/emails'
const DEFAULT_FROM = 'StreamVault <premium@stream-vault.site>'
const SEND_TIMEOUT_MS = 8000

export interface Email {
  to: string
  subject: string
  html: string
  text: string
}

/** What became of a send: `not-configured` means RESEND_API_KEY isn't set. */
export type SendResult = 'sent' | 'not-configured' | 'failed'

let warnedNotConfigured = false

export function isMailConfigured(): boolean {
  return !!process.env.RESEND_API_KEY?.trim()
}

/** Send one email. Never throws: a mail problem must never undo what the admin just did. */
export async function sendEmail(email: Email): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim()
  if (!apiKey) {
    if (!warnedNotConfigured) {
      warnedNotConfigured = true
      logger.warn('Email not sent: RESEND_API_KEY is not set (see backend/src/lib/mailer.ts)')
    }
    return 'not-configured'
  }
  const replyTo = process.env.MAIL_REPLY_TO?.trim()
  try {
    const res = await fetch(RESEND_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.MAIL_FROM?.trim() || DEFAULT_FROM,
        to: [email.to],
        subject: email.subject,
        html: email.html,
        text: email.text,
        ...(replyTo ? { reply_to: replyTo } : {}),
      }),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    })
    if (!res.ok) {
      const detail = (await res.text().catch(() => '')).slice(0, 300)
      logger.warn('Email send refused', { status: res.status, detail })
      return 'failed'
    }
    return 'sent'
  } catch (err: unknown) {
    logger.warn('Email send failed', { error: err instanceof Error ? err.message : String(err) })
    return 'failed'
  }
}
