# Usagi development releases

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
