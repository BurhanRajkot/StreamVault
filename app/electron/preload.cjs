/** What the app may ask of the Linux shell — see DesktopBridge in app/src/native/platform.ts. */
const { contextBridge, ipcRenderer } = require('electron')

const version = (process.argv.find((a) => a.startsWith('--sv-version=')) || '').split('=')[1] || ''

contextBridge.exposeInMainWorld('svDesktop', {
  version,
  canSelfUpdate: process.argv.includes('--sv-appimage'),
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
})

function subscribe(channel, callback) {
  const handler = (_event, value) => callback(value)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}
