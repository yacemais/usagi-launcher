# Usagi launcher updates

For the current independent `launcher-v` / `modpack-v` publication flow, see
[MODPACK_DISTRIBUTION.md](MODPACK_DISTRIBUTION.md). The application update center now
checks at startup, every 15 minutes and manually, and persists per-version notices.
Verified downloaded installers remain ready across successful periodic checks.

A missing channel JSON (HTTP 404) is shown as an unpublished channel, with the
checked time and no offered version. It is not labelled up to date and does not
produce an update failure notification. Stable never falls back to Beta automatically;
use the existing Release channel selector explicitly for development releases.
Other HTTP errors, invalid signatures, expired metadata and missing installer files
remain failures. Accepted sequence history is retained even while a channel is absent.
At verification on 2026-10-29, Stable returned 404 and Beta returned the correctly
signed 0.3.2 feed. A stable release/feed still needs owner-approved publication.

Application updates and Minecraft modpack updates are independent services. The app
uses pinned electron-updater 6.8.11's NSIS cache/install machinery, with a small
subclass using the inspected protected APIs for signed metadata and secure downloads.
Review these adapters against actual types/source before upgrading electron-updater.

## Trust and feed format

`config/usagi.json` contains launcherUpdates.baseUrl, an Ed25519 publicKey and optional
Windows publisherNames. These are packaged owner configuration, not renderer-editable
URLs or keys. The base URL serves **stable.json** and optionally **beta.json**. Each
file is the same `{payload,signature}` envelope concept as pack updates, but uses the
separate application schema in src/main/app-updates/release.ts and preferably its own key.

Decoded payload fields: schemaVersion=1, product=usagi, platform=win32, arch=x64,
channel, increasing sequence, semver version, publication/expiry times, plain-text
notes and installer URL/size/base64 SHA-512. Signature verification precedes parsing
and use. Channel/product/platform mismatches, stable prereleases, expiration,
unsafe filenames, rollback and conflicting sequence reuse are rejected. Accepted
sequence/payload records persist under launcher-updates/accepted-channels.json.

Unsigned `latest.yml` from a server is **not** used by this adapter. The small bundled
config/app-update.yml only sets a cache directory name for electron-updater; it is
not a remotely trusted update feed. Do not publish an unrelated latest.yml and expect
Usagi to use it. The exact signed channel JSON authorizes the installer bytes.

## Build and publish

Create owner keys in a secure folder outside the project, public site and application:

```powershell
node tools/create-signing-key.mjs C:\UsagiSigning usagi-app
node tools/create-signing-key.mjs C:\UsagiSigning celestia-pack
```

These commands intentionally create keys only when the owner runs them. Private files
are never bundled. Put the app **public** key and real channel base URL in config/usagi.json.
Rebuild so the installed client has this trust anchor. Use the separate pack public
key for modpack manifests. Keep private key backups offline.

```powershell
npm run package:win
node dist/tools/publish-app-release.cjs examples/app-release.example.json release/Usagi-Setup-0.2.0.exe C:\UsagiSigning\usagi-app-private.pem signed-stable.json
```

Before running the example, replace the reserved example URL, set correct UTC dates,
choose a new increasing sequence and write accurate release notes. The helper fills
the actual installer size/SHA-512 and signs the exact payload bytes. It checks the
expected installer/version filename. Verify the build's actual version and install it
in a test environment; filenames alone do not prove binary behavior.

Upload the immutable Usagi-Setup-version.exe artifact first, then publish the signed
envelope as launcher/channels/stable.json. For beta, build a prerelease version, use
channel=beta and publish beta.json. Never reuse a sequence with different content.
Keep previous installers available for manual recovery. See HOSTING.md for the exact tree.

## Client behavior

Usagi checks configured app releases at startup and every 15 minutes, and exposes Check, Download, Cancel,
and Restart and install on the Usagi tab. Download progress is real. Downloads use
the existing bounded HTTPS/DNS/path protections, retries and SHA-512 verification;
there is no simulated transfer or remote script execution in the renderer. Current
app downloads are full NSIS installers; differential downloads are intentionally disabled.

Cache content is verified after download and again immediately before installation.
If publisherNames is nonempty, Windows Authenticode verification must also succeed.
The current development binary has no publisher certificate, so the Ed25519 feed key
is the required release-authentication mechanism; it does not remove SmartScreen's
unsigned-publisher warning. Configure a real publisher and sign release binaries for
public distribution. Do not invent a publisher name or turn certificate failures off.

Installation requires a packaged app, no running Minecraft, no game-file operation
and no account sign-in. A native confirmation precedes the NSIS handoff. Downloaded
updates are not automatically installed just because the user closes Usagi. A record
of the attempted from/to versions is retained for diagnostics.

## Recovery limits

Cancelled/corrupt downloads leave the running app intact and can be retried; completed
verified downloads are reused after a new signed check. No automatic application
rollback is claimed. If a new version fails, reinstall a retained known-good installer
without deleting %APPDATA%/CelestiaLauncher or the game folder. These legacy locations
are intentionally retained. An interrupted NSIS replacement is governed by NSIS/Windows,
not the modpack transaction journal.

The actual NSIS cache/download pipeline is tested with explicit non-executable fixtures.
An installed-version-to-new-installed-version upgrade and production hosting have not
been run. They require a configured owner channel and a controlled installation test.
