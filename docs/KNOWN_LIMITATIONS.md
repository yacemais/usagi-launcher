# Known limitations

- Social has local protocol/GUI and Java transport verification, but is not deployed
  or verified between two authenticated players inside Minecraft. It needs a private
  Node 24 service/SQLite volume, an HTTPS/WSS origin, a server-only bridge secret and
  Minecraft API application approval. The launcher defaults to unconfigured Social.
  See SOCIAL.md for deployment, delivery crash windows and the live acceptance plan.
- Social uses one backend process and one active trusted Minecraft bridge. It has no
  multi-region/replica coordination or end-to-end message encryption. Crash-time
  delivery is at least once; ordinary reconnects deduplicate stable message IDs.
- The splash targets 60 FPS with CSS opacity/transforms. Timing, accessibility and
  transitions are tested; physical 60 FPS on every GPU/display is not guaranteed.

- Real Microsoft browser OAuth, Xbox Live and XSTS passed, but Minecraft Services
  rejects Usagi's client ID with HTTP 403, Invalid app registration. Minecraft API
  application access must be approved before real Java entitlement/profile retrieval,
  saved-account refresh/logout, account switching or authenticated game launch can
  be verified. Windows credential protection was tested separately. Unit fixtures
  cover orchestration and entitlement rejection; they do not bypass this live denial.
- The GitHub site/news endpoints are deployed, but there is no published launcher
  release or live signed update channel yet. The
  application-update verification key is bundled; its private key stays local until
  separately approved secret-store setup. No production modpack manifest, modpack
  verification key or game-server address is configured. There is no invented news,
  simulated online status, bundled pack, or redistribution-permission audit.
- Windows Java 17 on this host cannot start from a path containing the character 雪
  and loses this character in command-line classpaths. Official downloaded files
  were hash-verified and the same runtime worked at an ASCII path. Use an ASCII
  Java/runtime/game path (spaces work). Node updater filesystem tests support Unicode,
  but arbitrary Unicode end-to-end Java paths are unresolved. The launcher does not
  change Windows regional settings or silently map drives. Related upstream notes:
  https://www.oracle.com/java/technologies/javase/17-0-17-relnotes.html#JDK-8337506
- Automatic Java currently follows Mojang's Java-17 runtime channel (17.0.15 in the
  executed install). A current, compatible 64-bit Java 17 may be selected manually.
  Every vendor/update combination has not been tested.
- Minecraft server status uses TCP server-list ping with a bounded timeout. SRV record
  resolution is not implemented; configure the actual host and port. Quick Play auto
  join is wired but requires an authenticated game/server test.
- English only. Settings are language-ready; translation catalogs and RTL are absent.
- Offline cached signed pack verification works; launching still needs a valid
  refreshed official session. There is no offline account or cracked launch bypass.
- Installer signing, SmartScreen reputation, physical 4K/125%/150% Windows display
  scaling, accessibility screen-reader review, live game crashes, and interactive
  install/uninstall still require independent validation.
- Backups and interrupted staging remain on disk. No automatic pruning is included. Launcher self-update download/cache logic is tested, but a production installed-version upgrade is pending. Power-cut durability and adversarial same-user filesystem
  races are not fully addressed; see SECURITY.md.
- The configured antislop plugin cache and referenced agent-domain docs were absent.
  The explicit design specification was followed during implementation instead.
