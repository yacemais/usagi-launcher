# Usagi development releases

## 0.5.0 — Discord integrations (Beta)

- Added opt-in Discord Rich Presence in Settings, with preferences saved per
  Minecraft account, session duration and immediate clearing on disable/exit.
- Added verified vanilla/modded dimensions, optional events, player count and
  consenting friend names through the existing authenticated Social bridge.
- Added explicit Discord account pairing on Account: a backend-issued code,
  verified Discord claim and approval from the originating Minecraft session.
- Added signed expiring presence controls, privacy/source expiry, legacy Social
  capability negotiation and updated server-side integration sources.
- Preserved existing account storage, Microsoft authentication, installer/updater,
  visual assets, game data and the Celestials currency. No modpack content included.

Local regression and isolated Electron/Java integration tests cover these flows.
Rich Presence is off by default. Social and pairing require configured owner
infrastructure and real-account staging; Minecraft API application approval is
still pending. Marketplace purchases/sales from Discord remain disabled in the
separate backend. The installer has no Authenticode certificate; update metadata
uses the existing owner signing key. This is a Beta development release.

## 0.4.0 — distribution and updates (Beta)

- Added official Prism staging, permission/privacy review and approval-gated GitHub
  modpack release preparation with independent versioning and signed inventories.
- Added startup synchronization, reusable verified downloads, compatibility checks,
  process locking and centralized update notifications with 15-minute checks.
- Missing launcher/modpack feeds now show that no release is published instead of
  a raw HTTP 404 error. Stable never switches to Beta automatically.
- Restored explicit Windows taskbar icon metadata using the existing rabbit logo;
  development/test windows now have separate taskbar identities.
- Preserved existing authentication, NSIS updater, player data, visual design,
  gameplay identifiers and the Celestials currency.

155 automated tests passed, with real packaged GUI, notification persistence and
Windows taskbar-property checks. The Windows installer and complete unpacked folder
are available with signed Beta update metadata and SHA-256 checksums.

The modpack is staged privately and is not included in this release. Redistribution,
client compatibility and privacy reviews still gate its publication. Minecraft API
application approval and live Social/server testing remain pending. The Windows
installer has no Authenticode certificate; installed-to-installed upgrade validation
remains a separate acceptance test.

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
