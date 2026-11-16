/** What the app may ask of the desktop shell (Linux, Windows) — see DesktopBridge in app/src/native/platform.ts. */
const { contextBridge, ipcRenderer } = require('electron')

const arg = (name) => (process.argv.find((a) => a.startsWith(`--${name}=`)) || '').split('=')[1] || ''
const version = arg('sv-version')

contextBridge.exposeInMainWorld('svDesktop', {
  version,
  platform: arg('sv-platform'),
  canSelfUpdate: process.argv.includes('--sv-self-update'),
  download: (options) => ipcRenderer.invoke('sv:download', options),
  status: (ids) => ipcRenderer.invoke('sv:status', ids),
  remove: (options) => ipcRenderer.invoke('sv:remove', options),
  serve: (path) => ipcRenderer.invoke('sv:serve', path),
  openWith: (path) => ipcRenderer.invoke('sv:open-with', path),
  showInFolder: (path) => ipcRenderer.invoke('sv:show-in-folder', path),
  openExternal: (url) => ipcRenderer.invoke('sv:open-external', url),
  setFullscreen: (enabled) => ipcRenderer.invoke('sv:fullscreen', enabled),
  installUpdate: (source) => ipcRenderer.invoke('sv:install-update', source),
  freeSpace: () => ipcRenderer.invoke('sv:free-space'),
  frameless: true,
  windowControl: (action) => ipcRenderer.invoke('sv:window', action),
  onWindowState: (callback) => subscribe('sv:window-state', callback),
  onKey: (callback) => subscribe('sv:key', callback),
  rdCaps: () => ipcRenderer.invoke('sv:rd-caps'),
  rdOpen: (request) => ipcRenderer.invoke('sv:rd-open', request),
  rdClose: (token) => ipcRenderer.invoke('sv:rd-close', token),
})

function subscribe(channel, callback) {
  const handler = (_event, value) => callback(value)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}
