/**
 * StreamVault for Linux — the Electron shell.
 *
 * The app is served to its window as https://stream-vault.site, from the
 * files packaged with it: Chromium's resolver maps that one host to a small
 * HTTPS server on 127.0.0.1 (host-resolver-rules), with a certificate made on
 * this machine that only this window accepts, and only for that host. So the
 * backend's CORS list, Auth0's allowed origins and the embed servers' domain
 * checks all see the website they already trust, and every other host is
 * reached normally.
 *
 * The same server plays downloaded files back with range requests (seeking),
 * and the shell runs its own resumable downloader for offline copies.
 */

const { app, BrowserWindow, ipcMain, shell, net, Menu } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const fsp = require('node:fs/promises')
const https = require('node:https')
const crypto = require('node:crypto')
const { Readable } = require('node:stream')
const { pipeline } = require('node:stream/promises')

const SITE_HOST = 'stream-vault.site'
const SITE_ORIGIN = `https://${SITE_HOST}`
const PORT = 47321
/** Hosts the window itself may navigate to: the app, and the sign-in pages. */
const AUTH_HOSTS = [/\.auth0\.com$/, /^accounts\.google\.com$/, /^appleid\.apple\.com$/, /^accounts\.youtube\.com$/, /^(www\.)?google\.[a-z.]+$/]
/** Google turns sign-in away from browsers that say "Electron"; present as the Chrome underneath. */
const CHROME_UA = `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${process.versions.chrome} Safari/537.36`

if (!app.requestSingleInstanceLock()) {
  app.quit()
  process.exit(0)
}

app.commandLine.appendSwitch('host-resolver-rules', `MAP ${SITE_HOST} 127.0.0.1:${PORT}`)
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')
app.userAgentFallback = CHROME_UA
app.setName('StreamVault')

const distDir = path.join(__dirname, '..', 'dist')
const userData = () => app.getPath('userData')
const downloadsDir = () => path.join(app.getPath('videos') || app.getPath('downloads'), 'StreamVault')

// ── TLS for the local server ───────────────────────────────────────────────

let certFingerprint = ''

async function loadCertificate() {
  const file = path.join(userData(), 'local-tls.json')
  try {
    const saved = JSON.parse(await fsp.readFile(file, 'utf8'))
    if (saved.cert && saved.key && saved.expires > Date.now() + 7 * 86400e3) return saved
  } catch {
    // First run, or unreadable — make a new one
  }
  const selfsigned = require('selfsigned')
  const pems = await selfsigned.generate([{ name: 'commonName', value: SITE_HOST }], {
    keySize: 2048,
    algorithm: 'sha256',
    notAfterDate: new Date(Date.now() + 825 * 86400e3),
    extensions: [{ name: 'subjectAltName', altNames: [{ type: 2, value: SITE_HOST }] }],
  })
  const saved = { cert: pems.cert, key: pems.private, expires: Date.now() + 820 * 86400e3 }
  await fsp.mkdir(userData(), { recursive: true })
  await fsp.writeFile(file, JSON.stringify(saved), { mode: 0o600 })
  return saved
}

function sha256Fingerprint(pem) {
  const der = Buffer.from(pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, ''), 'base64')
  return 'sha256/' + crypto.createHash('sha256').update(der).digest('base64')
}

// ── The local server: app files + offline playback ─────────────────────────

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.mkv': 'video/x-matroska',
  '.webm': 'video/webm',
  '.avi': 'video/x-msvideo',
}

/** Offline files the window may play, by random token — never arbitrary paths. */
const servedFiles = new Map()

function sendFileRange(req, res, filePath) {
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404).end()
      return
    }
    const type = MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream'
    const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '')
    if (range) {
      const start = range[1] ? parseInt(range[1], 10) : 0
      const end = range[2] ? Math.min(parseInt(range[2], 10), stat.size - 1) : stat.size - 1
      if (start >= stat.size || start > end) {
        res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` }).end()
        return
      }
      res.writeHead(206, {
        'Content-Type': type,
        'Content-Length': end - start + 1,
        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
        'Accept-Ranges': 'bytes',
      })
      if (req.method === 'HEAD') return res.end()
      fs.createReadStream(filePath, { start, end }).pipe(res)
      return
    }
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': stat.size, 'Accept-Ranges': 'bytes' })
    if (req.method === 'HEAD') return res.end()
    fs.createReadStream(filePath).pipe(res)
  })
}

function startServer(tls) {
  const server = https.createServer({ key: tls.key, cert: tls.cert }, (req, res) => {
    const url = new URL(req.url || '/', SITE_ORIGIN)
    const offline = /^\/_offline\/([a-f0-9]{32})$/.exec(url.pathname)
    if (offline) {
      const filePath = servedFiles.get(offline[1])
      if (!filePath) return res.writeHead(404).end()
      return sendFileRange(req, res, filePath)
    }
    // App files; anything that isn't a file is a route of the app
    const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '')
    let filePath = path.join(distDir, rel)
    if (!filePath.startsWith(distDir) || !rel || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(distDir, 'index.html')
    }
    const type = MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream'
    const immutable = rel.startsWith('assets/')
    res.writeHead(200, {
      'Content-Type': type,
      'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
    })
    fs.createReadStream(filePath).pipe(res)
  })
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(PORT, '127.0.0.1', () => resolve(server))
  })
}

// ── Downloads: resumable, survive a restart ────────────────────────────────

/** id -> { id, url, path, total, bytes, status, reason } */
const transfers = new Map()
const controllers = new Map()
const stateFile = () => path.join(userData(), 'downloads.json')
let saveTimer = null

function persist() {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    fsp.writeFile(stateFile(), JSON.stringify([...transfers.values()])).catch(() => {})
  }, 500)
}

async function restoreTransfers() {
  try {
    const list = JSON.parse(await fsp.readFile(stateFile(), 'utf8'))
    for (const t of list) {
      transfers.set(t.id, t)
      if (t.status === 'running' || t.status === 'pending') runTransfer(t.id)
    }
  } catch {
    // Nothing saved yet
  }
}

async function runTransfer(id) {
  const t = transfers.get(id)
  if (!t) return
  const part = t.path + '.part'
  let have = 0
  try {
    have = (await fsp.stat(part)).size
  } catch {
    have = 0
  }
  const controller = new AbortController()
  controllers.set(id, controller)
  t.status = 'running'
  t.bytes = have
  persist()
  try {
    const res = await net.fetch(t.url, {
      headers: have > 0 ? { Range: `bytes=${have}-` } : {},
      signal: controller.signal,
    })
    if (!(res.ok || res.status === 206)) throw new Error(`The server answered ${res.status}`)
    const resumed = res.status === 206
    if (!resumed) have = 0
    const length = Number(res.headers.get('content-length')) || 0
    if (length) t.total = have + length
    const out = fs.createWriteStream(part, { flags: resumed ? 'a' : 'w' })
    const body = Readable.fromWeb(res.body)
    body.on('data', (chunk) => {
      t.bytes += chunk.length
    })
    t.bytes = have
    const tick = setInterval(persist, 2000)
    try {
      await pipeline(body, out)
    } finally {
      clearInterval(tick)
    }
    await fsp.rename(part, t.path)
    t.status = 'done'
    t.bytes = t.total = (await fsp.stat(t.path)).size
  } catch (err) {
    if (controller.signal.aborted) return
    t.status = 'failed'
    t.reason = err && err.message ? err.message : String(err)
  } finally {
    controllers.delete(id)
    persist()
  }
}

// ── Window ─────────────────────────────────────────────────────────────────

let win = null

function isAllowedInWindow(url) {
  try {
    const { protocol, hostname } = new URL(url)
    if (protocol !== 'https:') return false
    return hostname === SITE_HOST || AUTH_HOSTS.some((re) => re.test(hostname))
  } catch {
    return false
  }
}

function createWindow() {
  win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 380,
    minHeight: 560,
    backgroundColor: '#0a0a0c',
    title: 'StreamVault',
    icon: path.join(__dirname, 'icon.png'),
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: false,
      additionalArguments: [`--sv-version=${app.getVersion()}`, ...(process.env.APPIMAGE ? ['--sv-appimage'] : [])],
    },
  })
  Menu.setApplicationMenu(null)
  win.once('ready-to-show', () => win.show())

  // Links meant for outside (magnet:, upi:, the releases page) go to the system;
  // pop-ups from embed players are dropped.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^magnet:/i.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    if (isAllowedInWindow(url)) return
    event.preventDefault()
    if (/^(https?|magnet|upi):/i.test(url)) shell.openExternal(url)
  })
  win.webContents.on('before-input-event', (_event, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') win.setFullScreen(!win.isFullScreen())
    if (input.type === 'keyDown' && input.key === 'F12' && !app.isPackaged) win.webContents.toggleDevTools()
  })

  win.loadURL(SITE_ORIGIN + '/')
}

app.on('second-instance', () => {
  if (!win) return
  if (win.isMinimized()) win.restore()
  win.focus()
})

app.on('certificate-error', (event, _webContents, url, _error, certificate, callback) => {
  try {
    if (new URL(url).hostname === SITE_HOST && sha256Fingerprint(certificate.data) === certFingerprint) {
      event.preventDefault()
      callback(true)
      return
    }
  } catch {
    // fall through to the default (refuse)
  }
  callback(false)
})

// ── IPC: what the app asks of the shell (app/src/native/platform.ts) ───────

function registerIpc() {
  ipcMain.handle('sv:download', async (_e, { url, fileName }) => {
    const dir = downloadsDir()
    await fsp.mkdir(dir, { recursive: true })
    let target = path.join(dir, path.basename(fileName))
    for (let n = 1; fs.existsSync(target); n++) {
      const ext = path.extname(fileName)
      target = path.join(dir, `${path.basename(fileName, ext)} (${n})${ext}`)
    }
    const id = crypto.randomUUID()
    transfers.set(id, { id, url, path: target, total: 0, bytes: 0, status: 'pending' })
    persist()
    runTransfer(id)
    return { id, path: target }
  })

  ipcMain.handle('sv:status', (_e, ids) =>
    ids.map((id) => {
      const t = transfers.get(id)
      return t
        ? { id, status: t.status, bytes: t.bytes, total: t.total, reason: t.reason }
        : { id, status: 'failed', bytes: 0, total: 0, reason: 'Not found' }
    })
  )

  ipcMain.handle('sv:remove', async (_e, { id, path: filePath }) => {
    const t = id ? transfers.get(id) : null
    controllers.get(id)?.abort()
    transfers.delete(id)
    persist()
    const file = (t && t.path) || filePath
    if (file && file.startsWith(downloadsDir())) {
      await fsp.rm(file, { force: true })
      await fsp.rm(file + '.part', { force: true })
    }
  })

  ipcMain.handle('sv:serve', (_e, filePath) => {
    if (!filePath.startsWith(downloadsDir()) || !fs.existsSync(filePath)) throw new Error('That file is not on this computer any more.')
    const token = crypto.randomBytes(16).toString('hex')
    servedFiles.set(token, filePath)
    return { url: `${SITE_ORIGIN}/_offline/${token}` }
  })

  ipcMain.handle('sv:open-with', async (_e, filePath) => {
    if (filePath.startsWith(downloadsDir())) await shell.openPath(filePath)
  })
  ipcMain.handle('sv:show-in-folder', (_e, filePath) => {
    if (filePath.startsWith(downloadsDir())) shell.showItemInFolder(filePath)
  })
  ipcMain.handle('sv:open-external', async (_e, url) => {
    if (/^(https?|magnet|upi):/i.test(url)) await shell.openExternal(url)
  })
  ipcMain.handle('sv:fullscreen', (_e, enabled) => {
    if (win && win.isFullScreen() !== !!enabled) win.setFullScreen(!!enabled)
  })
  ipcMain.handle('sv:free-space', async () => {
    const dir = downloadsDir()
    await fsp.mkdir(dir, { recursive: true })
    const s = await fsp.statfs(dir)
    return { bytes: s.bavail * s.bsize }
  })

  // AppImage self-update: fetch the new AppImage (from the Supabase mirror in
  // parts, or GitHub in one piece) beside the running one, check it, swap, restart.
  ipcMain.handle('sv:install-update', async (_e, { urls, sha256 }) => {
    const current = process.env.APPIMAGE
    if (!current) return { ok: false, reason: 'Only the AppImage updates itself — install the new package from the releases page.' }
    const allowed = [
      'https://github.com/dragon-manner/StreamVault/releases/download/',
      'https://xpickztkltapgelrsdts.supabase.co/storage/v1/object/public/app-releases/',
    ]
    if (!Array.isArray(urls) || urls.length === 0 || !urls.every((u) => typeof u === 'string' && allowed.some((a) => u.startsWith(a)))) {
      return { ok: false, reason: 'Unexpected update address.' }
    }
    const tmp = current + '.update'
    try {
      const out = fs.createWriteStream(tmp, { mode: 0o755 })
      const hash = crypto.createHash('sha256')
      for (const url of urls) {
        const res = await net.fetch(url)
        if (!res.ok) throw new Error(`The download server answered ${res.status}`)
        for await (const chunk of Readable.fromWeb(res.body)) {
          hash.update(chunk)
          if (!out.write(chunk)) await new Promise((resolve) => out.once('drain', resolve))
        }
      }
      await new Promise((resolve, reject) => out.end((err) => (err ? reject(err) : resolve())))
      if (sha256 && hash.digest('hex') !== sha256) throw new Error('The download was corrupted — try again.')
      await fsp.chmod(tmp, 0o755)
      await fsp.rename(tmp, current)
      setTimeout(() => {
        app.relaunch({ execPath: current })
        app.exit(0)
      }, 400)
      return { ok: true }
    } catch (err) {
      await fsp.rm(tmp, { force: true })
      return { ok: false, reason: err && err.message ? err.message : String(err) }
    }
  })
}

app.whenReady().then(async () => {
  const tls = await loadCertificate()
  certFingerprint = sha256Fingerprint(tls.cert)
  try {
    await startServer(tls)
  } catch (err) {
    const { dialog } = require('electron')
    dialog.showErrorBox('StreamVault', `Couldn't start: port ${PORT} is in use.\n\n${err && err.message}`)
    app.quit()
    return
  }
  registerIpc()
  await restoreTransfers()
  createWindow()
})

app.on('window-all-closed', () => app.quit())
