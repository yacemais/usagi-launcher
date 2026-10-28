# Usagi

Usagi is the Windows launcher for Celestia SMP: **Minecraft 1.20.1, Forge 47.4.28,
Java 17**. Version **0.2.1** continues the existing launcher; the project directory,
game installer, signed modpack updates and protected player data remain in place.

The interface uses the owner's actual rabbit emblem and USAGI wordmark. It replaces
the decorative sky layout with warm charcoal surfaces, dusty pink controls and a
compact account/navigation layout. No AI-generated imagery or branding is used.

## Current status

- The official game/Forge installer, verification, repair, data protection and secure
  Electron boundaries are preserved.
- Microsoft browser sign-in uses MSAL authorization code flow, S256 PKCE, state and
  nonce validation, followed by Xbox/XSTS, Minecraft entitlement and profile checks.
  Device-code fallback, cancellation, refresh and Windows-encrypted persistence exist.
  The owner registration **ee966e53-e97c-46eb-b6ea-6de2cca23fd5** is integrated.
  **A real Microsoft account has not yet completed end-to-end testing.**
- Launcher updates now have a separate owner-signed release feed, stable/beta channels,
  verified installer download/cache, cancellation and an explicit NSIS restart/install
  handoff. The real cache/download path is tested with explicit fixtures. Installing
  a newer release over an installed launcher still needs an end-to-end deployment test.
- GitHub hosting is prepared for yacemais/usagi-launcher. Its Pages/release feeds are
  not deployed yet; the first push/release requires the owner's approval. A local
  private signing key stays ignored, with its public key bundled. No Authenticode
  certificate, approved modpack source or game server has been configured.

## Development

Use Windows x64 and Node 24. Dependencies are pinned in package-lock.json.

```powershell
npm ci
# Only if npm blocked Electron's lifecycle script:
node node_modules/electron/install.js
npm run build
npm start
```

`npm run dev` uses Vite at 127.0.0.1:5173. `npm test` runs the regression suite.
`npm run test:gui` launches actual Electron. `npm run package:win` builds an NSIS
installer and `release/win-unpacked/Usagi.exe`. Keep the entire unpacked folder together.

Owner assets are under branding/ and src/renderer/assets/. To reproduce deterministic
crops/icons, run `node_modules/.bin/electron.cmd tools/prepare-brand.cjs`.
The untouched owner image stays local; the public repository includes the prepared
logo crops and icon rather than the original image metadata.

## Configure a release

Fill `config/usagi.json` with the owner's public Microsoft client ID, modpack source,
server/news addresses and launcher-update public configuration, then rebuild. No
private key, client secret or server secret belongs in that file. Existing manual
settings remain supported. The compiled launcher-update trust key is deliberately
separate from renderer-editable settings.

See [Microsoft registration](docs/MICROSOFT_AUTH.md), [exact hosting layout](docs/HOSTING.md)
and [launcher update publishing](docs/LAUNCHER_UPDATES.md) before publishing.
The chosen repository and approval/authentication steps are in [GitHub hosting](docs/GITHUB.md).

## Upgrade compatibility

The installer identity `smp.celestia.launcher`, legacy `%APPDATA%/CelestiaLauncher`
folder, ownership marker and internal IPC/protocol names are retained for compatibility.
Visible branding, executable and installer are Usagi. Existing settings are loaded
without resetting the game folder; the new release channel defaults to stable.
Prism, Celestia Shop and SMP quest files are not modified.

## Documentation

- [Installation](docs/INSTALLATION.md) and [configuration](docs/CONFIGURATION.md)
- [Microsoft authentication setup and limitations](docs/MICROSOFT_AUTH.md)
- [Hosting: exact files, URLs and folder tree](docs/HOSTING.md)
- [Launcher updates](docs/LAUNCHER_UPDATES.md) and [modpack updates](docs/UPDATE_PUBLISHING.md)
- [Test report](docs/TESTING.md), [security](docs/SECURITY.md), [known limitations](docs/KNOWN_LIMITATIONS.md)
- [Owner asset and dependency credits](ASSET_CREDITS.md)
- [Actual screenshots](docs/screenshots)

Windows Java 17's arbitrary-Unicode path limitation remains documented. Use an ASCII
runtime/game path with spaces supported until that external Java behavior is resolved.
