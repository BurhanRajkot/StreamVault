# StreamVault app (Linux, Android, Windows)

A compact, app-style StreamVault built from the website's own code. Downloads
and install steps are in the [main README](../docs/README.md#-streamvault-apps).

```
app/
├── src/              The app's UI (React) — screens, components, native bridge
│   ├── screens/      Home (per category), Title, Player, Offline player, Search,
│   │                 Downloads, My Space, My List, Premium, Admin, Welcome
│   ├── downloads/    Offline downloads: find a Premium file, queue, progress
│   ├── native/       Platform bridge, GitHub update check + installer
│   └── auth/         Auth0 for the app (Custom Tab on Android)
├── android/          Capacitor Android project (+ SvNativePlugin.java)
├── electron/         Desktop shell for Linux + Windows (main.cjs, preload.cjs)
├── electron-builder.yml
└── capacitor.config.json
```

## How it fits together

- **One codebase with the site.** `@/…` imports resolve into the site's `src/`
  (API client, auth, servers, the Premium player, admin panels); `@app/…` is
  this folder. Change a server in `src/lib/config.ts` and the next app release
  has it.
- **It runs as `https://stream-vault.site`.** Capacitor's `server.hostname`
  (Android) and a local HTTPS server mapped with Chromium's
  `host-resolver-rules` (Linux, Windows) serve the bundled files under the site's
  origin, so the backend's CORS list, Auth0's allowed origins and the embed
  servers' domain checks all accept the app with no extra configuration.
- **Sign-in.** Linux and Windows sign in inside the window, like the website. Android
  opens Auth0 in a Chrome Custom Tab (Google refuses logins inside web views);
  Auth0 returns to `https://stream-vault.site/?code=…`, which Android hands to
  the app as a verified App Link — that needs
  [`public/.well-known/assetlinks.json`](../public/.well-known/assetlinks.json)
  live on the site, with the release key's SHA-256 fingerprint.
- **Offline downloads** are Premium: the app finds a release the way the
  Premium player does, asks Real-Debrid for the direct file, and hands it to
  Android's DownloadManager (or the desktop shell's resumable downloader). Files
  play back through a local server that answers range requests, so seeking
  works with no connection; "Open with…" hands a file to VLC & co.
- **Updates.** `.github/workflows/app-release.yml` publishes `app-v1.0.<run>`
  on every push to `main` that touches `app/` or `src/`. The app compares its
  version with the newest `app-v*` release and offers it: Android opens the
  APK installer, the AppImage swaps itself, and Windows runs the new
  installer silently over the old one (`/S --updated --force-run`), which
  keeps the app's data and starts the new version.

## Build locally

Needs Node 22+, JDK 21 and the Android SDK (`ANDROID_HOME` or
`android/local.properties` with `sdk.dir=…`). Install the site's packages at the
repo root first (`npm ci`) — the app is built from them.

```bash
cd app
npm ci
npm run dev              # the UI in a browser (API calls need the site origin — use linux:dev)
npm run linux:dev        # Linux shell against the built bundle
npm run linux:build      # release/StreamVault-<v>.AppImage, .pacman, .deb
npm run windows:build    # release/StreamVault-Setup-<v>.exe (on Windows; CI builds it on windows-latest)
npm run android:apk      # android/app/build/outputs/apk/release/app-release.apk
```

A development copy can run beside an installed StreamVault: give it another
port and profile, e.g. `SV_PORT=47399 npx electron . --user-data-dir=/tmp/sv-dev`.

## Look and feel

The app has its own design, separate from the website's: the site stays
static for speed, while the app runs on the device and animates freely
(framer-motion: page fades, a drifting hero carousel, rows that rise in,
cards that lift under the mouse, sheets you swipe away). Fonts (Manrope,
Inter) are bundled. In a wide window it switches to the desktop layout — a
glass top bar that is also the desktop window's title bar (the window is
frameless; `TitleBar.tsx` draws the drag area and window buttons). A narrow
window (snapped beside another, split screen) gets a slim title strip instead,
and the players carry the window's buttons too (`WindowControls.tsx`): a film
plays in the window — move it, resize it, minimize it, or pin it on top of
other windows — and goes full screen only from its button, F11 or the
"Open the player in full screen" setting (Escape leaves it). On embed
servers the player's bar fades, but a handle at the top always opens the
server drawer, and Escape (forwarded by the shell even while the embed's
frame has focus) brings the controls back.

## Release signing (Android)

Every APK must be signed with **the same key**, or Android refuses to install
an update over the previous version. The key lives outside the repo:

- locally: `android/keystore.properties` (git-ignored) → `storeFile`,
  `storePassword`, `keyAlias`, `keyPassword`
- CI: repository secrets `ANDROID_KEYSTORE_BASE64` (the `.jks`, base64),
  `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`

**Back the keystore up.** Losing it means every phone has to uninstall the app
once to move to a new key (and `assetlinks.json` needs the new fingerprint).

Print the fingerprint for `assetlinks.json`:

```bash
keytool -list -v -keystore <file>.jks -alias streamvault | grep SHA256
```
