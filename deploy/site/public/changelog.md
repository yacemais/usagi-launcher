# Usagi development releases

## 0.3.2 — branding update

- Renamed remaining visible Celestia references to Usagi / Usagi SMP on Home,
  Social, News, Updates, Settings, installation status and the download page.
- Updated Windows package description/author. Existing data directories, installer
  identity, protocol and managed-file records stay compatible.

This remains a beta development preview. Minecraft Services application approval
and live Social deployment/testing are still pending.

## 0.3.1 — startup timing fix

- The original-logo animation starts after the native window is visible and logo
  assets have decoded, keeping its full 2.6 second duration visible.
- Reduced motion still skips the animation. Hidden-window and packaged Windows
  timing regressions passed; 110 automated regression tests passed.
- Windows installer and complete unpacked ZIP are available. Extract the entire
  unpacked ZIP before launching `win-unpacked/Usagi.exe`.

This remains a beta development preview. Minecraft Services application approval
and live Social deployment/testing are still pending; authentication is not bypassed.

## 0.3.0 — development preview

- Original-logo startup animation, reduced motion and live transition checks.
- Social friends, private conversations, privacy and presence UI.
- Separate persistent HTTP/WebSocket/SQLite backend with verified identity, blocks,
  rate limits, offline delivery and stable message IDs.
- Server-only Forge bridge and private /usagi commands, with Java transport
  round-trip and Forge GameTest coverage.

Not deployed or tested between two authenticated in-game clients. Minecraft API
approval, staging infrastructure and the live acceptance plan remain required.

## 0.2.1

- Integrated the owner's registered Microsoft public application ID.
- Tightened the single-use localhost PKCE callback and account-change locking.
- Prepared Windows build, draft-release and signed GitHub Pages feed workflows.
- Added private-data-safe HTTP/Xbox error diagnostics and completed-step auth logs.

Source and Pages are published with owner approval, and the hosted Windows build
passed. Real Microsoft browser OAuth, Xbox Live and XSTS passed. Minecraft Services
returns HTTP 403, Invalid app registration; full Java sign-in requires application
API access approval. An installed-to-installed upgrade remains untested. No launcher
release has been published.

## 0.2.0

- Owner-provided rabbit emblem, wordmark and app icon.
- Simplified warm charcoal and pink interface.
- Browser authorization code flow with PKCE; device-code fallback retained.
- Separate signed launcher updates using the NSIS updater.
- Existing signed modpack updates, installation verification and data protection preserved.

Real Microsoft account validation requires an owner app registration. Public update
hosting and installation of a newer launcher release have not been production-tested.
