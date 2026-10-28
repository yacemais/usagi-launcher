# Configuration

Usagi 0.2.0 also bundles public owner defaults in config/usagi.json. Fill those before
building a distributed release. Launcher update URLs/trust keys are supplied only by
that packaged configuration; ordinary player settings do not authorize executable
updates. See MICROSOFT_AUTH.md, LAUNCHER_UPDATES.md and HOSTING.md for the current setup.
The Updates > Usagi launcher tab saves the stable/beta appUpdateChannel preference.

Settings are persisted under the application data folder. Edit through the UI, or
close the application before editing settings.json. Invalid stored settings fail
closed instead of being silently reset. Source defaults are in
`src/main/settings/store.ts`; validation is shared in `src/shared/validation.ts`.

| Setting | Meaning |
| --- | --- |
| RAM | MB, minimum 2 GB, maximum 32 GB or physical RAM minus 2 GB, whichever is lower |
| Resolution / fullscreen | Minecraft launch preferences; not a renderer zoom control |
| Game directory | Dedicated owned game folder, outside Prism and SMP development |
| Java executable | Blank downloads Mojang Java 17; otherwise absolute java.exe/javaw.exe |
| Launch behavior | Stay open or minimize after Java starts; does not kill the game |
| Download concurrency | 1–12 workers; cancellation waits for active workers to stop |
| Notifications | Desktop error/game-exit notifications; essential errors remain visible |
| Language | English currently; represented in the shared settings for later translations |
| Manifest URL | HTTPS endpoint returning the signed JSON envelope |
| Manifest public key | Ed25519 SPKI PEM public key, never a private key |
| Optional file paths | Exact optional paths declared by the signed manifest |
| Server host / port | Actual server-list ping target; blank means unconfigured |
| Auto join | Minecraft 1.20.1 Quick Play argument when a server is configured; not yet game-tested |
| News URL | Optional HTTPS JSON feed; blank means no invented announcements |
| Microsoft client ID | Public native-application registration identifier; not a secret |

HTTPS downloads reject private/loopback/link-local destinations, credentials in URLs,
nonstandard ports, unsafe redirects and DNS results that are not public. Development
HTTP fixture servers are injected only by test code; there is no production bypass.
Server-list TCP ping may target a private game server, independently of downloads.
An installed pack checks its configured signed update source on startup. A known new
version changes the Home action to UPDATE and must be installed before launching.
If the update endpoint is unavailable, the error is shown while the previously
verified installed files remain available for a later authenticated launch.

## Microsoft account registration

The owner must register a Microsoft Entra public/native application suitable for
personal Microsoft accounts and enable supported public-client/device-code use.
Request only the Xbox/Minecraft scopes needed by the current authentication flow.
Minecraft API access may require Microsoft approval for the registration. Verify
the current requirements with Microsoft before releasing. Do not use another
launcher's client ID, embed client secrets, or request a user's password.

The client ID is a public app identifier, analogous to a label that tells Microsoft
which application is requesting sign-in. System-browser PKCE sign-in and its optional
device-code fallback happen on Microsoft's own website. MSAL refresh is followed by Xbox Live, XSTS, Minecraft token, entitlement
and profile requests. Launch requires a successful fresh check. No ID/account has
been supplied for an actual end-to-end sign-in test.

MSAL's cache and profile metadata are encrypted using Electron safeStorage (Windows
DPAPI). Minecraft access tokens remain in main-process memory. Logout removes the
local cache account; it does not revoke every Microsoft session on other devices.

Official references:
- https://learn.microsoft.com/en-us/entra/identity-platform/scenario-desktop-app-registration
- https://learn.microsoft.com/en-us/entra/msal/javascript/node/acquire-token-requests
- https://xmcl.app/en/user/

## News feed

See `examples/news.example.json`. It is a clearly labelled schema example, not an
actual Celestia announcement. Dates use ISO UTC. Text is rendered as text, never HTML.
Optional content, external HTTPS links and owner-supplied PNG/JPEG/WebP images are
supported. Image size and feed size are capped. Publish only images with appropriate
rights and record attribution in ASSET_CREDITS.md.

## Dependency compatibility adapters

The pinned `@xmcl/unzip@2.2.0` publication contains a `workspace:^*` dependency on
`@xmcl/yauzl`; package.json overrides that dependency to the published 2.10.0 version.
Its published main field points at absent TypeScript, so esbuild/Vitest resolve the
installed dist/index.js. The installer also imports an unpublished
`@xmcl/core/utils` subpath only for isNotNull; a local null predicate supplies that
one symbol. The aliases are in `tools/xmcl-aliases.mjs` and vitest.config.ts.
No node_modules files are patched. Review/remove these adapters when upgrading XMCL.
