<div align="center">
  <br />
  <h1 style="font-weight: 900; font-size: 4rem; text-transform: uppercase; background: linear-gradient(90deg, #ff00cc, #333399); -webkit-background-clip: text; -webkit-text-fill-color: transparent; font-family: 'Plus Jakarta Sans', 'Inter', system-ui, sans-serif; letter-spacing: -2px;">
    Piracy is not stealing.
  </h1>
  <br />
  <img src="https://media1.tenor.com/m/Zf2cK-sJOrsAAAAd/hackerman.gif" alt="hacker" width="600" style="border-radius: 12px; box-shadow: 0 20px 40px rgba(0,0,0,0.3);" />
</div>

<br />

## 📱 StreamVault apps — Android & Linux

| Platform | Download | Notes |
| --- | --- | --- |
| **Android** | [**StreamVault.apk**](https://github.com/BurhanRajkot/StreamVault/releases/latest/download/StreamVault.apk) | Open the file on your phone and allow installing from your browser when Android asks. |
| **Linux** (any distro) | [**StreamVault.AppImage**](https://github.com/BurhanRajkot/StreamVault/releases/latest/download/StreamVault.AppImage) | `chmod +x StreamVault.AppImage && ./StreamVault.AppImage` |
| **Arch / EndeavourOS** | `.pacman` on the [releases page](https://github.com/BurhanRajkot/StreamVault/releases/latest) | `sudo pacman -U StreamVault-*.pacman` |
| **Debian / Ubuntu** | `.deb` on the [releases page](https://github.com/BurhanRajkot/StreamVault/releases/latest) | `sudo apt install ./StreamVault-*.deb` |

Everything the website has — movies, TV shows, anime and documentaries, every server (Sol, Sirius, … ⚡ Premium last), your account, My List, Continue Watching, CineMatch recommendations, Premium plans, and the admin dashboard — in a compact app, plus **offline downloads**.

**Updates:** every change pushed to `main` builds a new release automatically ([App Release workflow](../.github/workflows/app-release.yml)). The apps check GitHub on launch and show *“StreamVault x.y.z is available — Update”*; on Android that downloads and installs the new APK, and the AppImage replaces itself.

Building the apps yourself: see [`app/README.md`](../app/README.md).
