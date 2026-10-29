# Modpack distribution and publishing

Version 0.4.0 Beta continues the existing launcher. Its source and Windows launcher
release are separate from modpack publication: no modpack binaries are included.
Preparing or publishing a modpack still requires its own review and explicit approval.
Authentication still requires Microsoft's Minecraft API application approval.

The source of truth is the existing Prism instance named
`Celestia_SMP_Alpha_0.1_Prism_Bootstrap` under `%APPDATA%/PrismLauncher/instances`.
Preparation reads it and creates a separate staging copy. The Prism pre-launch
PowerShell bootstrap is never copied or executed by Usagi.

## Release layout

Repository: https://github.com/yacemais/usagi-launcher

```text
launcher-v0.4.0/
  Usagi-Setup-0.4.0.exe
  usagi-stable.json                signed application release envelope
  SHA256SUMS.txt

modpack-v0.1.0/
  modpack-manifest.json            complete signed modpack manifest
  file-<sha256>                   one asset per distinct new file content
  THIRD_PARTY_NOTICES.json         reviewed license/permission evidence
  changelog.md                    complete added/changed/removed file list

GitHub Pages:
  launcher/channels/stable.json
  launcher/channels/beta.json
  modpacks/usagi/stable.json
```

Modpack version numbers are independent of the launcher. Preparation chooses 0.1.0
for the first release and increments the previous published patch version thereafter.
An explicit increasing stable version can be supplied. Existing launcher `v0.x` tags
continue to work; future launcher releases use `launcher-v`.

Every manifest is a complete installation inventory. A fresh install downloads all
selected required files; an existing install hashes its files and downloads only
missing/changed content. A monolithic ZIP is deliberately unnecessary. Unchanged
files reuse their immutable earlier release URLs, including for new players. Never
delete an old release whose assets remain referenced by a newer manifest.

GitHub currently permits 1000 assets per release, each under 2 GiB. Usagi applies a
stricter 1 GiB per-file limit and refuses oversized release plans. See the
[GitHub release limits](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases).
The launcher depends only on signed manifests and public HTTPS file URLs. To move
to R2, upload identical content-addressed files there and publish a new signed
manifest with those URLs. The downloader and transaction system remain the same.
The `upstream` review action also supports authorized original download hosts without
rehosting restricted JARs on GitHub. Those files are size/hash checked before publishing.

## Manifest format

The release asset and Pages stable feed both contain an Ed25519 envelope:

```json
{"payload":"base64 of the exact UTF-8 JSON bytes","signature":"base64 Ed25519 signature"}
```

The decoded JSON has this shape (the hash/URL below are illustrative):

```json
{
  "schemaVersion": 1,
  "sequence": 1793220000,
  "version": "0.1.0",
  "minecraft": "1.20.1",
  "forge": "47.4.28",
  "java": 17,
  "minLauncherVersion": "0.4.0",
  "notes": "Release summary",
  "publishedAt": "2026-10-29T00:00:00.000Z",
  "expiresAt": "2027-10-29T00:00:00.000Z",
  "files": [{
    "path": "mods/example.jar",
    "size": 12345,
    "sha256": "<64 lowercase hexadecimal characters>",
    "url": "https://github.com/yacemais/usagi-launcher/releases/download/modpack-v0.1.0/file-<sha256>",
    "policy": "managed",
    "optional": false
  }]
}
```

Signatures authenticate metadata; SHA-256 authenticates individual downloaded files.
Sequence numbers increase even when intentionally restoring old pack contents.
Reusing a sequence with different content or downgrading a sequence is rejected.
New official packs require 0.4.0 because older clients do not understand the added
compatibility fields. Minecraft/Forge/Java targets are exact and fail closed.
Online manifests expire after one year; publish a fresh version/sequence before expiry.
Already installed, signed content can still be verified offline after that date.

`managed` files are pack-owned and can be replaced with backup/recovery.
`seed` files are installed when absent and preserve subsequent personal changes.
Client preferences and shader selections default to seed. Review these classifications
when an official config must be enforced. A seed file with personal content cannot
silently become managed. Managed config contents, mod IDs and currency names are
copied byte for byte, without branding replacements.

## Prepare a release

Use PowerShell from the project directory, with Node 24 and installed dependencies:

```powershell
.\tools\Prepare-Modpack.ps1 -Output .scratch-runtime\modpack-review
```

Default preparation reads all published GitHub release pages and verifies the latest
official modpack signature before comparing. It fails on API/network errors instead
of assuming there is no previous release. `-Baseline first` is an explicit offline
first-release preparation mode; publication still checks real remote history.
For offline fixture preparation, `-Baseline <signed-envelope.json>` is supported.

The output contains:

```text
client/                         separate candidate client copy, never uploaded wholesale
inventory.private.json         actual hashes, embedded license metadata, privacy findings
review.private.json            per-file review catalog, bound to exact SHA-256 values
unsigned-manifest.json         complete proposed installation and download URLs
changes.json                   added, modified and removed file paths
release-plan.json              readiness, blockers and exact upload inventory
assets/                        only explicitly selected public release assets
validation-cache/              verified upstream bytes, created during preflight
```

Only mods, config, defaultconfigs, KubeJS, resourcepacks, shaderpacks and Moonlight
global datapacks are candidates. Worlds, screenshots, runtime libraries, accounts,
logs, maps, histories, marketplace player state, hidden indexes/caches and dedicated
server state are excluded. KubeJS `server_scripts` may implement integrated-server
gameplay and are reviewed individually, rather than discarded by their folder name.

Every candidate needs a recorded redistribution decision, client/both side assessment,
license/permission evidence and private-data review. Embedded `license=` metadata is
evidence to inspect; it never grants automatic permission. Check source/attribution
obligations and separate asset licenses. `All Rights Reserved` is not authorization.
For example, the current
[Sophisticated Backpacks license](https://raw.githubusercontent.com/P3pp3rF1y/SophisticatedBackpacks/1.20.x/LICENSE.md)
prohibits rehosting without permission. Use an authorized original download or obtain
explicit permission for the exact artifact. Do not remove required mods just to pass review.

Review entry example:

```json
{
  "sha256": "<exact staged file hash>",
  "action": "include",
  "side": "both",
  "license": "MIT",
  "evidence": "Exact version's license URL; required notice retained in the original JAR",
  "privacyReviewed": true,
  "policy": "managed"
}
```

Actions are `review`, `include`, `upstream` and `exclude`. For `upstream`, supply
`url` and evidence permitting that download; the matching Prism index URL/hash is
included as a private review hint when it matches the installed bytes. Exclusions
need an explicit reason. Server-only artifacts must be excluded. Unknown permissions
or side/privacy decisions block signing, upload and publication.

After editing the private review catalog, prepare a new stage:

```powershell
.\tools\Prepare-Modpack.ps1 `
  -Review .scratch-runtime\modpack-review\review.private.json `
  -Output .scratch-runtime\modpack-ready
```

Unchanged hash-bound review entries are reused on later releases. New or changed
content returns to review. Preparation never overwrites an existing staging folder.

## Sign, review and publish

The modpack public key and future Pages source are configured in config/usagi.json.
The matching new private key was created locally under the ignored
`.scratch-runtime/signing/usagi-pack-private.pem`. Back it up privately outside the
checkout; retain the same key for future releases. It was not uploaded or embedded.
The existing launcher signing key remains separate.

To sign and validate locally, without uploading:

```powershell
node tools/build-release-tools.mjs
node dist/tools/modpack-release.cjs sign .scratch-runtime/modpack-ready .scratch-runtime/signing/usagi-pack-private.pem
node dist/tools/modpack-release.cjs validate .scratch-runtime/modpack-ready
```

Inspect `release-plan.json`, `changes.json`, `unsigned-manifest.json`, notices and
changelog. Then, only after approving that concrete result:

```powershell
.\tools\Publish-Modpack.ps1 `
  -Stage .scratch-runtime\modpack-ready `
  -PrivateKey .scratch-runtime\signing\usagi-pack-private.pem `
  -Gh .scratch-runtime\tools\github-cli\gh.exe
```

If `gh` is installed on PATH, omit `-Gh`. Use `-Target <reviewed-commit-SHA>` when
pinning the tag to a particular reviewed commit; the default target is main.
The script prints the tag/target, complete upload hashes and changelog, then requires
typing `publish <tag> <release-plan-SHA256>`. Before that explicit approval it performs
only local writes and remote reads. It then creates a draft, uploads the exact files,
checks every server-reported size/SHA-256, and publishes. No asset is overwritten.
An interrupted upload stays a draft. Rerun with `-ResumeDraft` to verify and complete
it after review. A changed baseline or unreviewed draft asset blocks publication.

Post-publication, the script checks public release visibility and anonymous HTTPS
availability. The existing release event dispatches the Pages refresh from main.
Check the Actions run and the stable feed; clients detect it at their next poll/start.
No GitHub credential is included in the launcher or public manifest.

## Launcher publication and repository setup

Keep the repository public and Pages source set to GitHub Actions. The existing
`.github/workflows/pages.yml` must reach main after source review/approval; its feed
builder now discovers both release families and skips drafts/development modpacks.
It checks that GitHub-hosted referenced assets exist before advertising a pack.

For a launcher update, update package.json/package-lock version and the release notes,
run `npm test`, `npm run package:win`, and inspect the resulting NSIS installer.
The existing manually dispatched `draft-release.yml` now creates a `launcher-v` tag
and the signed app feed. Trusted CI signing needs the matching private application
key in `USAGI_APP_SIGNING_KEY`; no secret was configured by this task. Alternatively,
use tools/publish-app-release.ts with the existing local key and an accurate template.
Review and explicitly approve draft upload/publication. Publishing a modpack never
requires a launcher rebuild unless its minLauncherVersion genuinely changes.

Usagi retains electron-updater 6.8.11's verified NSIS cache/handoff. Its signed custom
feed intentionally replaces generic `latest.yml`; blockmaps are not required. NSIS
settings preserve AppData. No Authenticode certificate is configured, and a real
installed-to-installed Windows upgrade remains a deployment acceptance test.

## Runtime behavior and recovery

The update center checks both sources at startup, every 15 minutes and from
Updates > Check for updates. Polling uses small Pages feeds, without a GitHub API
token or per-player API requests. Offline users discover the same signed release
on their next successful check. The process exits with the launcher.

Startup synchronizes the modpack, including a fresh client folder. Official Java,
Minecraft and Forge installation remains the existing separate install action.
While Minecraft runs, checks only report new versions; changes are deferred until
the game closes. Required compatibility updates block installation/launch, with
an action to review the launcher release. Failed online checks preserve a verified
installed pack, while actual launch still requires official account authentication.

Notifications identify launcher/modpack, installed/available versions, compatibility,
completion and failures. They persist under `update-notices.json`, including dismissed
version IDs, so repeated checks/restarts do not repeat the same notice. Release notes
and actions stay in the existing Updates page. Desktop notifications honor settings
and are suppressed during gameplay. The history retains up to 2000 events.

Files are hashed before comparison and downloaded to a verified content-addressed
cache under `game/.celestia/downloads/`. Completed downloads survive interruption;
only incomplete/corrupt files need downloading again. A transaction stages copies,
syncs backups, writes a recovery journal, replaces files, then commits the ledger.
Cancellation is deferred during commit/rollback. A prepared interrupted journal is
rolled back on the next startup before PLAY can become available.

Concurrent operations are rejected in-process and through a per-game-directory PID
lock. A dead process's valid lock is reclaimed before recovery; malformed locks fail
closed for manual review. Only previously tracked, unchanged managed files can be removed. Modified obsolete
configs, seeded preferences and unrelated files are preserved. A modified obsolete
managed mod blocks the transaction so it cannot silently remain in a supposedly
compatible installation. Resolve the named file manually and retry. Untracked
conflicts block overwrites. Recovery refuses to overwrite independently changed files.
Backups/caches/staging have no automatic retention pruning yet; keep them for recovery
and remove old unused cache/transaction directories only with the launcher closed,
after confirming no journal remains. No physical-power-cut or hostile same-user
filesystem guarantee is claimed.
