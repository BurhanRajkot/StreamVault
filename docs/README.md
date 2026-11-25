<div align="center">
  <br />
  <h1 style="font-weight: 900; font-size: 4rem; text-transform: uppercase; background: linear-gradient(90deg, #ff00cc, #333399); -webkit-background-clip: text; -webkit-text-fill-color: transparent; font-family: 'Plus Jakarta Sans', 'Inter', system-ui, sans-serif; letter-spacing: -2px;">
    Piracy is not stealing.
  </h1>
  <br />
  <img src="https://media1.tenor.com/m/Zf2cK-sJOrsAAAAd/hackerman.gif" alt="hacker" width="600" style="border-radius: 12px; box-shadow: 0 20px 40px rgba(0,0,0,0.3);" />
</div>

<br />

## 📱 StreamVault apps

The same library, account, servers and My List as [stream-vault.site](https://stream-vault.site), plus offline downloads, as an app for your computer or phone.

| | Download | Updates |
|---|---|---|
| 🐧 **Linux** | [`StreamVault.AppImage`](https://github.com/dragon-manner/StreamVault/releases/latest/download/StreamVault.AppImage) · [`.deb`](https://github.com/dragon-manner/StreamVault/releases/latest/download/StreamVault.deb) · [`.pacman`](https://github.com/dragon-manner/StreamVault/releases/latest/download/StreamVault.pacman) | AppImage updates itself |
| 🤖 **Android** | [`StreamVault.apk`](https://xpickztkltapgelrsdts.supabase.co/storage/v1/object/public/app-releases/StreamVault.apk) | Updates itself |
| 📺 **Android TV / Google TV** | the same APK: in Downloader, enter `stream-vault.site/apk` | Updates itself |
| 🪟 **Windows** | [`StreamVault-Setup.exe`](https://github.com/dragon-manner/StreamVault/releases/latest/download/StreamVault-Setup.exe) | Updates itself |

Every version is on the [releases page](https://github.com/dragon-manner/StreamVault/releases). If GitHub downloads crawl for you, the Linux commands below fetch from the fast mirror instead.

### 🐧 Linux

**AppImage (any distro).** This one command downloads it from the fast mirror into `~/Applications` and starts it. On first run it adds itself, with its icon, to your applications menu:

```bash
mkdir -p ~/Applications && cd ~/Applications && curl -fL "https://xpickztkltapgelrsdts.supabase.co/storage/v1/object/public/app-releases/linux/StreamVault.AppImage.part[1-4]" > StreamVault.AppImage && chmod +x StreamVault.AppImage && ./StreamVault.AppImage
```

**Arch / EndeavourOS / Manjaro:**

```bash
curl -fL "https://xpickztkltapgelrsdts.supabase.co/storage/v1/object/public/app-releases/linux/StreamVault.pacman.part[1-4]" > StreamVault.pacman && sudo pacman -U StreamVault.pacman
```

**Debian / Ubuntu / Mint:**

```bash
curl -fL "https://xpickztkltapgelrsdts.supabase.co/storage/v1/object/public/app-releases/linux/StreamVault.deb.part[1-4]" > StreamVault.deb && sudo apt install ./StreamVault.deb
```

The AppImage installs its own updates. With the `.deb` or `.pacman`, the app tells you when a new version is out and opens the releases page.

### 🤖 Android

1. On your phone, [download `StreamVault.apk`](https://xpickztkltapgelrsdts.supabase.co/storage/v1/object/public/app-releases/StreamVault.apk) and open it.
2. If Android asks, allow your browser to **install unknown apps**, then tap **Install**.

Needs Android 7.0 or newer. New versions show up in the app: tap **Update now**.

### 📺 Android TV / Google TV

The Android app is a TV app too: it puts its banner on the TV's home screen, lays out for the big screen and works with the remote.

1. Install **Downloader** (by AFTVnews) from the TV's Play Store.
2. Allow it to install apps: **Settings → Apps → Security & restrictions → Unknown sources → Downloader** (on some TVs it's under **Device Preferences**).
3. In Downloader, enter `stream-vault.site/apk`, then **Install**.

To sign in, open **My Space → Sign In** on the TV. It shows a code: on your phone, go to `stream-vault.site/activate` (or scan the QR code), enter it and sign in there. The TV signs itself in. New versions show up in the app like on a phone.

### 🪟 Windows

1. [Download `StreamVault-Setup.exe`](https://github.com/dragon-manner/StreamVault/releases/latest/download/StreamVault-Setup.exe) and run it. It installs for your user, so no admin prompt, and adds Start menu and desktop shortcuts.
2. **"Windows protected your PC"?** The installer isn't code-signed yet. Click **More info → Run anyway**.

Needs Windows 10 or 11 (64-bit). The app updates itself. To uninstall it, go to **Settings → Apps**.
