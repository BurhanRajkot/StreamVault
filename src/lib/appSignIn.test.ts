import { describe, expect, it } from 'bun:test'
import { appSignInStep } from './appSignIn'

const DOMAIN = 'tenant.us.auth0.com'
const AUTHORIZE = `https://${DOMAIN}/authorize?client_id=abc&redirect_uri=https%3A%2F%2Fstream-vault.site&state=s1&code_challenge=x`

function memoryStore(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  }
}

const at = (pathname: string, search = '', hash = '') => ({ pathname, search, hash })

describe('appSignInStep', () => {
  it('remembers the port and goes on to Auth0', () => {
    const store = memoryStore()
    const hash = `#port=51234&url=${encodeURIComponent(AUTHORIZE)}`
    expect(appSignInStep(at('/app-signin', '', hash), store, DOMAIN)).toEqual({ redirect: AUTHORIZE })
    expect(store.data.get('sv-app-signin-port')).toBe('51234')
  })

  it('refuses to send the browser anywhere but the tenant’s authorize endpoint', () => {
    for (const url of ['https://evil.example/authorize', `https://${DOMAIN}/logout`, `http://${DOMAIN}/authorize`, 'javascript:alert(1)']) {
      const store = memoryStore()
      const hash = `#port=51234&url=${encodeURIComponent(url)}`
      expect(appSignInStep(at('/app-signin', '', hash), store, DOMAIN)).toEqual({ redirect: '/' })
      expect(store.data.size).toBe(0)
    }
  })

  it('refuses a port that isn’t one', () => {
    for (const port of ['80', '70000', 'abc', '1234@evil.example']) {
      const hash = `#port=${encodeURIComponent(port)}&url=${encodeURIComponent(AUTHORIZE)}`
      expect(appSignInStep(at('/app-signin', '', hash), memoryStore(), DOMAIN)).toEqual({ redirect: '/' })
    }
  })

  it('hands Auth0’s answer to the waiting app, once', () => {
    const store = memoryStore({ 'sv-app-signin-port': '51234' })
    expect(appSignInStep(at('/', '?code=c1&state=s1'), store, DOMAIN)).toEqual({
      redirect: 'http://127.0.0.1:51234/callback?code=c1&state=s1',
    })
    expect(appSignInStep(at('/', '?code=c1&state=s1'), store, DOMAIN)).toBeNull()
  })

  it('passes a refusal on too, so the app can say why', () => {
    const store = memoryStore({ 'sv-app-signin-port': '51234' })
    const search = '?error=access_denied&error_description=Nope&state=s1'
    expect(appSignInStep(at('/', search), store, DOMAIN)).toEqual({ redirect: `http://127.0.0.1:51234/callback${search}` })
  })

  it('leaves the website’s own sign-in alone', () => {
    expect(appSignInStep(at('/', '?code=c1&state=s1'), memoryStore(), DOMAIN)).toBeNull()
    expect(appSignInStep(at('/movies'), memoryStore({ 'sv-app-signin-port': '51234' }), DOMAIN)).toBeNull()
  })
})
