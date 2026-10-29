# Usagi

Usagi is the Windows launcher for Usagi SMP: **Minecraft 1.20.1, Forge 47.4.28,
Java 17**. Development preview **0.4.0 (Beta)** continues the existing launcher; the project directory,
game installer, signed modpack updates and protected player data remain in place.

[Download the 0.4.0 Beta preview](https://github.com/yacemais/usagi-launcher/releases/tag/launcher-v0.4.0).
The release includes the Windows installer, complete unpacked folder and source.
Version 0.3.1 fixes startup timing. The unchanged Social backend and Forge bridge
remain available in [0.3.0](https://github.com/yacemais/usagi-launcher/releases/tag/v0.3.0).
Social still needs deployment and Minecraft API approval before live use.

The 0.3.2 build replaces remaining visible Celestia branding with Usagi/Usagi
SMP across Home, Social, News, Updates, Settings, status messages and the download
page. Legacy storage, installer and protocol identifiers
remain compatible with existing accounts, settings and managed game files.

The interface uses the owner's actual rabbit emblem and USAGI wordmark. It replaces
the decorative sky layout with warm charcoal surfaces, dusty pink controls and a
compact account/navigation layout. No AI-generated imagery or branding is used.

## Current status

- Version 0.4.0 adds Prism staging, independently versioned GitHub modpack releases,
  automatic synchronization, 15-minute checks and persistent update notifications.
  See [the audit](docs/MODPACK_AUDIT.md) and
  [exact preparation/publication commands](docs/MODPACK_DISTRIBUTION.md).
  The real pack is staged privately; redistribution/client/privacy reviews and owner
  publication approval are still required. The launcher release includes no modpack
  binaries or player data. Select Beta in Updates to receive development releases.
- Missing release feeds are shown as unpublished channels rather than raw HTTP 404
  errors. Windows taskbar icons explicitly use the existing owner logo; test windows
  use a separate identity so they cannot replace the normal launcher icon.

- A 2.6 second startup animation uses the original logo, with no generated artwork
  or fake progress. It starts when the native window is visible, after decoding the
  logo. Reduced motion skips the animation/delay. Actual source and packaged-window
  timing tests passed, including a window kept hidden for 2.8 seconds.
- Social adds a friends/conversations UI, a separate persistent Node/WebSocket/SQLite
  service and a server-only Forge bridge. Local protocol, UI and Java transport tests
  passed; it is **not deployed or verified with two authenticated Minecraft players**.
  The configured endpoint stays blank until the owner provides infrastructure.
  See [Social deployment and acceptance](docs/SOCIAL.md).

- The official game/Forge installer, verification, repair, data protection and secure
  Electron boundaries are preserved.
- Microsoft browser sign-in uses MSAL authorization code flow, S256 PKCE, state and
  nonce validation, followed by Xbox/XSTS, Minecraft entitlement and profile checks.
  Device-code fallback, cancellation, refresh and Windows-encrypted persistence exist.
  The owner registration **ee966e53-e97c-46eb-b6ea-6de2cca23fd5** is integrated.
  Real Microsoft browser login, Xbox Live and XSTS passed. **Minecraft Services
  blocks Usagi with HTTP 403, Invalid app registration**; Java entitlement/profile
  verification and full saved-account testing require Minecraft API access approval.
- Launcher updates now have a separate owner-signed release feed, stable/beta channels,
  verified installer download/cache, cancellation and an explicit NSIS restart/install
  handoff. The real cache/download path is tested with explicit fixtures. Installing
  a newer release over an installed launcher still needs an end-to-end deployment test.
- Reviewed source and GitHub Pages are published for yacemais/usagi-launcher after
  owner approval. The owner has authorized publishing 0.4.0 as a development
  prerelease on the beta channel. A local private signing key stays
  ignored, with its public key bundled. No Authenticode
  certificate or game server has been configured. The future modpack feed and a
  separate verification key are bundled, pending approved modpack publication.

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

`npm run test:startup` checks hidden-window timing, the logo transition and reduced
motion. Set `USAGI_PACKAGED_EXE` to test a packaged executable with an isolated profile.
`npm run build:social` builds the independent backend; `npm run test:social-gui`
uses real local transport/storage with explicit test identities. Forge build and
GameTest instructions are in [the server integration](integrations/forge/README.md).
The Social backend still needs its own deployment; publishing source or installer
assets does not activate Social or remove Minecraft's application-access requirement.

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
- [Complete modpack distribution workflow](docs/MODPACK_DISTRIBUTION.md) and [audit](docs/MODPACK_AUDIT.md)
- [Test report](docs/TESTING.md), [security](docs/SECURITY.md), [known limitations](docs/KNOWN_LIMITATIONS.md)
- [Owner asset and dependency credits](ASSET_CREDITS.md)
- [Actual screenshots](docs/screenshots)

Windows Java 17's arbitrary-Unicode path limitation remains documented. Use an ASCII
runtime/game path with spaces supported until that external Java behavior is resolved.
