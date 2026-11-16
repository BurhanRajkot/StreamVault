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
| 🪟 **Windows** | [`StreamVault-Setup.exe`](https://github.com/dragon-manner/StreamVault/releases/latest/download/StreamVault-Setup.exe) | Updates itself |

Every version is on the [releases page](https://github.com/dragon-manner/StreamVault/releases).

### 🐧 Linux

**AppImage (any distro).** This one command downloads it from the fast mirror and starts it:

```bash
curl -fL "https://xpickztkltapgelrsdts.supabase.co/storage/v1/object/public/app-releases/linux/StreamVault.AppImage.part[1-4]" > StreamVault.AppImage && chmod +x StreamVault.AppImage && ./StreamVault.AppImage
```

**Arch / EndeavourOS / Manjaro:**

```bash
curl -fLO https://github.com/dragon-manner/StreamVault/releases/latest/download/StreamVault.pacman && sudo pacman -U StreamVault.pacman
```

**Debian / Ubuntu / Mint:**

```bash
curl -fLO https://github.com/dragon-manner/StreamVault/releases/latest/download/StreamVault.deb && sudo apt install ./StreamVault.deb
```

The AppImage installs its own updates. With the `.deb` or `.pacman`, the app tells you when a new version is out and opens the releases page.

### 🤖 Android

1. On your phone, [download `StreamVault.apk`](https://xpickztkltapgelrsdts.supabase.co/storage/v1/object/public/app-releases/StreamVault.apk) and open it.
2. If Android asks, allow your browser to **install unknown apps**, then tap **Install**.

Needs Android 7.0 or newer. New versions show up in the app: tap **Update now**.

### 🪟 Windows

1. [Download `StreamVault-Setup.exe`](https://github.com/dragon-manner/StreamVault/releases/latest/download/StreamVault-Setup.exe) and run it. It installs for your user, so no admin prompt, and adds Start menu and desktop shortcuts.
2. **"Windows protected your PC"?** The installer isn't code-signed yet. Click **More info → Run anyway**.

Needs Windows 10 or 11 (64-bit). The app updates itself. To uninstall it, go to **Settings → Apps**.
