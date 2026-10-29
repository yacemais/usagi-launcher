# Distribution audit

This change starts from the working 0.3.2 project and implements 0.4.0 Beta.
The baseline working tree was clean; origin is yacemais/usagi-launcher on main.
Git uses LF text, case-insensitive Windows paths and symlinks disabled. Implementation
preserved the remote configuration and existing history. The owner subsequently
authorized the separate launcher source/release publication; modpack publication
remains blocked by its own review and approval.
The applicable parent AGENTS.md and DESIGN.md were read. The referenced optional
agent-domain and antislop cache files are absent; DESIGN.md already records the
owner's during-implementation visual mode. The launcher design is retained.

## Existing systems retained

| Area | Existing implementation | Work in this change |
| --- | --- | --- |
| Minecraft runtime | XMCL official Mojang client/assets/libraries, Forge processors, Java 17 installer and receipt verification | Retained; compatibility is checked before initiating core installation |
| Authentication | MSAL browser PKCE/state/nonce, device fallback, Xbox/XSTS, Minecraft entitlement/profile, DPAPI account cache | Retained without bypasses or live sign-in attempts |
| Modpack updater | Ed25519 manifests, SHA-256 downloads, managed/seed ownership, optional files, backups/journal recovery | Reused; startup synchronization, compatibility checks, persistent verified download cache, operation exclusion and safer obsolete-mod handling added |
| Launcher updater | Separate signed feed, pinned trust key, electron-updater 6.8.11 NSIS cache/progress/cancel/install | Retained; periodic/manual central checks and downloaded-state preservation added |
| GitHub distribution | Releases for NSIS, Pages for signed application channels/news, manually invoked draft workflow | Extended to discover signed modpack releases and new launcher-v tags, retaining historical v tags |
| UI / IPC | Sandboxed Electron main/preload, strict Zod commands, React update tabs and progress | Existing controls/styles retained; shared update check, persistent notices, pack changelog and compatibility actions added |
| Social / server | Independent Node/SQLite/WebSocket service, trusted server-only Forge bridge, server ping/news | Retained; server bridge/secrets are never bundled into the client pack |
| Settings / storage | Legacy application ID, CelestiaLauncher AppData, ownership marker and typed settings | Retained; existing settings and player directories stay in place |

The reviewed project includes source, shared validation, renderer pages/styles,
authentication/network/filesystem boundaries, social service/Forge integration,
tests, build/release tools, README and existing documentation/workflows.
The original regression baseline was 110 passing tests.

## Prism findings

The actual instance uses `minecraft/`, not `.minecraft/`. Its mmc-pack.json specifies
Minecraft 1.20.1 and Forge 47.4.28. Java must be x64 17; the client runtime remains
installed separately from official sources, rather than copied out of Prism.

There are 136 top-level mod JARs, with Forge/Fabric Connector dependencies,
KubeJS/Rhino, FTB quests and compatibility mods, graphics/shader integrations,
world generation and the existing Usagi Shop JAR. Its internal ID `celestiashop`
and the Celestials currency remain unchanged. Quest and KubeJS files are copied
without text replacements. The bootstrap script/MODLIST are historical guidance;
the actual installed bytes determine the proposed inventory.

The file named `forge-1.20.1.jar` is actually Zeio's Inventory Sort Button, according
to its embedded metadata. It must not be mistaken for the Forge runtime installer.
ImmediatelyFast's filename mentions 1.20.4, but its declared Minecraft range includes
1.20.1; it is not automatically replaced. Connector, experimental graphics mods and
custom licenses warrant actual game acceptance testing after authentication approval.

Only client distribution roots are staged. Prism worlds, screenshots, maps,
logs/crash reports, ModernFix cache, root options, accounts/caches, bootstrap hooks,
hidden download indexes and Connector caches are not release assets. Nested player
history, voice-chat identities/volumes, marketplace state and dedicated-server
settings are also excluded. KubeJS integrated-server quest logic is preserved.

The clean local candidate contains 493 files, 472,633,525 bytes (about 451 MiB),
including those 136 JARs, 346 configs, three defaultconfigs, six KubeJS files and
two shader files. Resourcepacks and Moonlight global datapacks are currently empty.
No high-confidence private-data pattern was detected in candidate text, which does
not replace the required content review. The initial audit stage is superseded by
the clean private `modpack-prism-review` stage under .scratch-runtime.

The local private inventory extracts embedded licenses and matching Prism download
provenance. It includes full per-file review blockers; no license is automatically
treated as permission to rehost. Several mods use All Rights Reserved or custom
terms. In particular, the author's current
[Sophisticated Backpacks license](https://raw.githubusercontent.com/P3pp3rF1y/SophisticatedBackpacks/1.20.x/LICENSE.md)
prohibits redistribution without permission. Authorized upstream downloads are
supported so required gameplay does not need to be removed.

Prism's side labels are hints rather than an authoritative client classifier: some
indexes label JEI and Xaero's Minimap as server-side. They must be reviewed against
the mod itself instead of automatically removing those required client features.

## Acceptance boundaries

Local mocked releases exercise complete/incremental installation, file protection,
downloads, failures, compatibility, notifications and release preparation. They do
not establish that every third-party mod is legally redistributable or that this
specific pack completes a real Forge boot. Publication remains blocked until the
exact candidate's permission, client-side and privacy review is complete.

The new modpack key is local/ignored and its public half is bundled. Keep it backed
up outside the checkout. The existing launcher key, legacy data identity, Microsoft
registration and public repository remain unchanged. The configured future pack
feed will be unavailable until an approved modpack release is published. Existing
installed launchers need the 0.4.0 application
release once to gain these features; later pack updates are independent.

Minecraft API approval is still needed for entitlement/profile, real saved-session
refresh/account switching and authenticated game launch. A live server is needed
for multiplayer compatibility, Quick Play and two-player Social acceptance. Neither
is required by the local distribution tests. Authenticode, an actual installed NSIS
upgrade and physical power-loss behavior remain separate acceptance tasks.
