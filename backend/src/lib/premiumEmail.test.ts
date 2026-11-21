import { afterEach, beforeAll, beforeEach, describe, expect, it, mock } from 'bun:test'

// premiumEmail reads the account from Supabase, which throws on load without keys (as in CI).
let userRow: { email: string | null; name: string | null } | null = null
mock.module('./supabase', () => ({
  supabaseAdmin: {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: userRow, error: null }) }) }) }),
  },
}))

// Imported once the stub is in place (a static import would hoist past it).
let buildPremiumGrantedEmail: typeof import('./premiumEmail').buildPremiumGrantedEmail
let notifyPremiumGranted: typeof import('./premiumEmail').notifyPremiumGranted
let sendEmail: typeof import('./mailer').sendEmail

beforeAll(async () => {
  ;({ buildPremiumGrantedEmail, notifyPremiumGranted } = await import('./premiumEmail'))
  ;({ sendEmail } = await import('./mailer'))
})

const realFetch = globalThis.fetch
const savedKey = process.env.RESEND_API_KEY
let sent: Array<{ url: string; headers: Record<string, string>; body: Record<string, unknown> }>

beforeEach(() => {
  sent = []
  userRow = null
  process.env.RESEND_API_KEY = 're_test'
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    sent.push({ url: String(input), headers: init?.headers as Record<string, string>, body: JSON.parse(String(init?.body)) })
    return new Response(JSON.stringify({ id: 'email-1' }), { status: 200 })
  }) as typeof fetch
})

afterEach(() => {
  globalThis.fetch = realFetch
  if (savedKey === undefined) delete process.env.RESEND_API_KEY
  else process.env.RESEND_API_KEY = savedKey
})

describe('the Premium granted email', () => {
  it('says what Premium gives — 4K streams in the app — and that downloads are not included', () => {
    const email = buildPremiumGrantedEmail('viewer@example.com', { name: 'Asha Rao' })
    expect(email.subject).toContain('Premium is on')
    for (const part of [email.text, email.html]) {
      expect(part).toContain('4K')
      expect(part).toContain('doesn’t include downloads')
      expect(part).toContain('Hi Asha,')
      expect(part).toContain('https://github.com/BurhanRajkot/StreamVault/releases/latest')
    }
  })

  it('says Premium is back on, rather than welcoming them again, after a pause', () => {
    expect(buildPremiumGrantedEmail('viewer@example.com', { resumed: true }).subject).toBe('Your StreamVault Premium is back on')
  })

  it('escapes the account’s name in the HTML, and leaves out names that are email addresses', () => {
    expect(buildPremiumGrantedEmail('v@example.com', { name: '<b>x</b>' }).html).toContain('Hi &lt;b&gt;x&lt;/b&gt;,')
    expect(buildPremiumGrantedEmail('v@example.com', { name: 'v@example.com' }).text).toContain('Hi,\n')
  })
})

describe('notifyPremiumGranted', () => {
  it('sends it through Resend to the address the account has on file', async () => {
    userRow = { email: 'viewer@example.com', name: 'Asha' }
    expect(await notifyPremiumGranted('auth0|a')).toBe('sent')
    expect(sent).toHaveLength(1)
    expect(sent[0].url).toBe('https://api.resend.com/emails')
    expect(sent[0].headers.Authorization).toBe('Bearer re_test')
    expect(sent[0].body.to).toEqual(['viewer@example.com'])
  })

  it('prefers the address it was given (an access request carries one)', async () => {
    expect(await notifyPremiumGranted('auth0|a', { email: 'from-request@example.com' })).toBe('sent')
    expect(sent[0].body.to).toEqual(['from-request@example.com'])
  })

  it('sends nothing to an account with no address', async () => {
    userRow = { email: null, name: null }
    expect(await notifyPremiumGranted('auth0|a')).toBe('no-email')
    expect(sent).toHaveLength(0)
  })

  it('sends nothing, and fails nothing, when email isn’t set up', async () => {
    delete process.env.RESEND_API_KEY
    expect(await notifyPremiumGranted('auth0|a', { email: 'viewer@example.com' })).toBe('not-configured')
    expect(sent).toHaveLength(0)
  })

  it('reports a refused send instead of throwing', async () => {
    globalThis.fetch = (async () => new Response('{"message":"domain not verified"}', { status: 403 })) as unknown as typeof fetch
    expect(await sendEmail(buildPremiumGrantedEmail('viewer@example.com'))).toBe('failed')
  })
})
