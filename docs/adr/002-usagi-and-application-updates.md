# 002: Usagi branding and independent signed application updates

Status: implemented for development; real-account and deployed upgrade validation pending.

Use the owner's actual logo/wordmark instead of generated branding. Keep existing
data paths, ownership marker, installer app identity and internal protocol/IPC names
so the visible rename does not lose an installation. New settings load with defaults.

Microsoft system-browser code flow adds a short-lived loopback listener, PKCE/state/
nonce and cancellation. Device-code fallback remains. Every Minecraft launch still
requires official refresh, Xbox/Minecraft authorization and Java entitlement.

Application releases use a separate signed JSON schema and pinned owner key. A
small adapter around inspected electron-updater 6.8.11 protected APIs supplies trusted
metadata, the existing hardened downloader and explicit NSIS handoff. It does not
consume unauthenticated generic latest.yml metadata. Optional Authenticode publisher
verification is additive. Differential app downloads are disabled; modpack downloads
remain changed-files-only. Upgrade the adapter only after checking actual APIs/tests.

No automatic app rollback or successful real Microsoft sign-in is claimed. Use a
controlled installed-version upgrade test after owner keys/endpoints are configured.
