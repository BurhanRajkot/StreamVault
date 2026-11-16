// npm test (from app/)
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { createBrowserSignIn, isAuthorizeUrl } = require('./browserSignIn.cjs')

const SITE = 'https://stream-vault.site'
const AUTHORIZE = 'https://stream-vault.jp.auth0.com/authorize?client_id=abc&state=s1&code_challenge=x'

function harness(options = {}) {
  const opened = []
  let returned = 0
  const signIn = createBrowserSignIn({
    siteOrigin: SITE,
    openExternal: async (url) => void opened.push(url),
    onReturn: () => void returned++,
    ...options,
  })
  return { signIn, opened, returned: () => returned }
}

/** The opened page's hash carries the port and the authorize URL. */
function startParams(url) {
  assert.ok(url.startsWith(`${SITE}/app-signin#`))
  return new URLSearchParams(url.split('#')[1])
}

async function waitFor(check) {
  for (let i = 0; i < 100; i++) {
    const value = check()
    if (value) return value
    await new Promise((r) => setImmediate(r))
  }
  throw new Error('timed out')
}

test('only Auth0 authorize URLs', () => {
  assert.equal(isAuthorizeUrl(AUTHORIZE), true)
  assert.equal(isAuthorizeUrl('https://evil.example/authorize'), false)
  assert.equal(isAuthorizeUrl('http://stream-vault.jp.auth0.com/authorize'), false)
  assert.equal(isAuthorizeUrl('https://stream-vault.jp.auth0.com/v2/logout'), false)
})

test('opens the site with a loopback port, and answers what Auth0 returned', async () => {
  const { signIn, opened, returned } = harness()
  const result = signIn.start(AUTHORIZE)
  const params = startParams(await waitFor(() => opened[0]))
  assert.equal(params.get('url'), AUTHORIZE)
  const port = Number(params.get('port'))
  assert.equal(port, signIn.port())

  assert.equal((await fetch(`http://127.0.0.1:${port}/favicon.ico`)).status, 404)
  assert.equal((await fetch(`http://127.0.0.1:${port}/callback?code=c1`)).status, 404, 'no state, no answer')

  const res = await fetch(`http://127.0.0.1:${port}/callback?code=c1&state=s1`)
  assert.equal(res.status, 200)
  assert.match(await res.text(), /signed in/)
  assert.equal(await result, `${SITE}/?code=c1&state=s1`)
  assert.equal(returned(), 1)
  assert.equal(signIn.port(), null)
  await assert.rejects(fetch(`http://127.0.0.1:${port}/callback?code=c2&state=s2`), 'the port closes after one answer')
})

test('passes a refusal on', async () => {
  const { signIn, opened } = harness()
  const result = signIn.start(AUTHORIZE)
  const port = startParams(await waitFor(() => opened[0])).get('port')
  const res = await fetch(`http://127.0.0.1:${port}/callback?error=access_denied&state=s1`)
  assert.match(await res.text(), /didn’t finish/)
  assert.equal(await result, `${SITE}/?error=access_denied&state=s1`)
})

test('a second sign-in, a cancel or the timeout answers null', async () => {
  const { signIn, opened } = harness()
  const first = signIn.start(AUTHORIZE)
  await waitFor(() => opened[0])
  const second = signIn.start(AUTHORIZE)
  assert.equal(await first, null)
  await waitFor(() => opened[1])
  signIn.cancel()
  assert.equal(await second, null)

  const quick = harness({ timeoutMs: 20 })
  assert.equal(await quick.signIn.start(AUTHORIZE), null)
})

test('refuses anything but an authorize URL', async () => {
  const { signIn, opened } = harness()
  await assert.rejects(signIn.start('https://evil.example/authorize'))
  assert.equal(opened.length, 0)
})
