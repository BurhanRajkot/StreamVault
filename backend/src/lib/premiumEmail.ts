import { supabaseAdmin } from './supabase'
import { logger } from './logger'
import { sendEmail, type Email, type SendResult } from './mailer'

/**
 * The email an account gets when the admin gives it Premium — from the
 * access-request queue, the Users panel, or a subscription approval.
 *
 * `resumed`: the account had Premium before and the admin paused it; this
 * says it's back on rather than welcoming them again.
 */

const APP_URL = 'https://github.com/BurhanRajkot/StreamVault/releases/latest'
const SITE_URL = 'https://stream-vault.site'

/** What a grant's email came to: `no-email` when the account has no address on file. */
export type PremiumEmailResult = SendResult | 'no-email'

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

/** First name for the greeting — nothing that looks like an email address. */
function greetingName(name: string | null | undefined): string | null {
  const first = name?.trim().split(/\s+/)[0]
  if (!first || first.includes('@') || first.length > 40) return null
  return first
}

export function buildPremiumGrantedEmail(to: string, opts: { name?: string | null; resumed?: boolean } = {}): Email {
  const first = greetingName(opts.name)
  const hello = first ? `Hi ${first},` : 'Hi,'
  const subject = opts.resumed ? 'Your StreamVault Premium is back on' : 'You’re in — StreamVault Premium is on for your account'
  const lead = opts.resumed
    ? 'Your Premium access has been switched back on. Everything is just as you left it.'
    : 'Good news: your request was accepted and Premium is now on for your account.'

  const perks = [
    ['4K & 1080p streams', 'Straight from Real-Debrid — the best copy of each film and episode, no ads, no pop-ups.'],
    ['Our own player', 'Pick the quality, audio and subtitles, and pick up where you stopped.'],
    ['Every title', 'Movies, shows, anime and documentaries — Premium is always the last server in the list.'],
  ]

  const text = [
    hello,
    '',
    lead,
    '',
    'What you get:',
    ...perks.map(([title, body]) => `- ${title}: ${body}`),
    '',
    'Streaming only: Premium doesn’t include downloads.',
    '',
    'How to watch: open the StreamVault app (Android, Linux or Windows), choose a title, then pick Premium as the server.',
    `Get the app: ${APP_URL}`,
    '',
    'Enjoy the show,',
    'StreamVault',
    SITE_URL,
  ].join('\n')

  const html = `<!doctype html>
<html lang="en">
<body style="margin:0;padding:0;background:#0b0b0f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#e8e8ed;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0b0b0f;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#16161c;border-radius:18px;overflow:hidden;">
        <tr><td style="padding:28px 28px 8px;">
          <p style="margin:0 0 6px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#0a84ff;font-weight:600;">⚡ StreamVault Premium</p>
          <h1 style="margin:0;font-size:24px;line-height:1.25;color:#ffffff;">${escapeHtml(subject)}</h1>
        </td></tr>
        <tr><td style="padding:12px 28px 4px;font-size:15px;line-height:1.55;">
          <p style="margin:0 0 12px;">${escapeHtml(hello)}</p>
          <p style="margin:0 0 18px;">${escapeHtml(lead)}</p>
        </td></tr>
        ${perks
          .map(
            ([title, body]) => `<tr><td style="padding:0 28px 12px;">
          <p style="margin:0;font-size:15px;font-weight:600;color:#ffffff;">${escapeHtml(title)}</p>
          <p style="margin:2px 0 0;font-size:14px;line-height:1.5;color:#a1a1aa;">${escapeHtml(body)}</p>
        </td></tr>`
          )
          .join('\n        ')}
        <tr><td style="padding:6px 28px 4px;">
          <p style="margin:0;padding:12px 14px;border-radius:12px;background:#22222a;font-size:14px;line-height:1.5;color:#d4d4d8;">
            <strong style="color:#ffffff;">Streaming only.</strong> Premium doesn’t include downloads.
          </p>
        </td></tr>
        <tr><td style="padding:18px 28px 8px;font-size:15px;line-height:1.55;">
          <p style="margin:0 0 16px;">Open the StreamVault app (Android, Linux or Windows), choose a title, then pick <strong style="color:#ffffff;">Premium</strong> as the server.</p>
          <a href="${APP_URL}" style="display:inline-block;padding:12px 22px;border-radius:999px;background:#0a84ff;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;">Get the app</a>
        </td></tr>
        <tr><td style="padding:22px 28px 28px;font-size:13px;line-height:1.5;color:#71717a;">
          Enjoy the show,<br>StreamVault · <a href="${SITE_URL}" style="color:#71717a;">stream-vault.site</a><br>
          You’re getting this because the admin gave Premium to the account ${escapeHtml(to)}.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`

  return { to, subject, html, text }
}

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/

/**
 * Email the account that it now has Premium. `email`/`name` are used when
 * the caller already has them (an access request carries them); otherwise
 * they're read from the account. Never throws.
 */
export async function notifyPremiumGranted(
  userId: string,
  opts: { email?: string | null; name?: string | null; resumed?: boolean } = {}
): Promise<PremiumEmailResult> {
  try {
    let email = opts.email?.trim() || null
    let name = opts.name ?? null
    if (!email) {
      const { data } = await supabaseAdmin.from('User').select('email, name').eq('id', userId).maybeSingle()
      const row = data as { email?: string | null; name?: string | null } | null
      email = row?.email?.trim() || null
      name = name ?? row?.name ?? null
    }
    if (!email || !EMAIL_RE.test(email)) {
      logger.info('Premium granted; no email on file to tell the account', { userId })
      return 'no-email'
    }
    const result = await sendEmail(buildPremiumGrantedEmail(email, { name, resumed: opts.resumed }))
    if (result === 'sent') logger.info('Premium granted email sent', { userId })
    return result
  } catch (err: unknown) {
    logger.warn('Premium granted email failed', { userId, error: err instanceof Error ? err.message : String(err) })
    return 'failed'
  }
}
