# GitHub hosting preparation

Repository: https://github.com/yacemais/usagi-launcher (public, empty when inspected).
No first push, release, Pages setting change or signing-secret upload is authorized
without the owner's review/approval. The files below are prepared locally.

## Authentication

GitHub CLI and Git Credential Manager initially had no authenticated account. The
official checksum-verified GitHub CLI is available in the ignored local directory:

```powershell
& ".\.scratch-runtime\tools\github-cli\gh.exe" auth login --hostname github.com --git-protocol https --web
& ".\.scratch-runtime\tools\github-cli\gh.exe" api user --jq .login
```

Complete the official browser/device login yourself. Do not paste a PAT, password,
device code or OAuth token into the chat or repository. Use credential protection;
do not use --insecure-storage. The connected GitHub integration is an alternative
for repository access, but large release assets use the CLI workflow.

## Prepared workflows

- windows-build.yml: read-only permissions, tests and a Windows NSIS development
  artifact on main pushes/PRs. It cannot publish a release and receives no signing key.
- draft-release.yml: manual main-branch dispatch, Windows build/tests, signed feed,
  and draft release assets. Existing releases are never overwritten. It does not
  publish its draft; the owner reviews/publishes after approval.
- pages.yml: builds the static site on main pushes and published-release events.
  Only the deployment job receives pages/id-token write permissions. It verifies
  signed channel metadata against the embedded public key before deployment.

Official action releases are pinned to the verified full commit IDs. GitHub Actions
has not run yet because nothing has been pushed. Local tests do not substitute for
a real hosted Windows build or installed-to-installed upgrade.

## Target URLs, not yet deployed

```text
https://yacemais.github.io/usagi-launcher/
https://yacemais.github.io/usagi-launcher/launcher/channels/stable.json
https://yacemais.github.io/usagi-launcher/news/index.json
https://github.com/yacemais/usagi-launcher/releases
```

The launcher public config points at these target feeds. Until Pages and the first
release are published, a missing-feed error is expected. The first Pages deployment
has no launcher channel if there is no published release; no download is fabricated.
OAuth redirects to **http://localhost**, never to GitHub Pages.

## One-time owner setup after approving publication

Enable repository Actions and select **Settings > Pages > Source: GitHub Actions**.
The prepared application signing key is local/ignored. Back it up privately. Its
public key is embedded in config/usagi.json; the private key is never staged.
To let trusted manual release builds sign metadata, put the matching private PEM
into an Actions secret named **USAGI_APP_SIGNING_KEY**. This is a secret-store upload,
not a source file; it must be reviewed/approved before being performed.

Do not generate a replacement key each release: existing installed clients trust
the current public key. No production Authenticode certificate is configured, so
Windows installers are development/unsigned even though their update feeds are signed.

## First release sequence

1. Review the staged source and publication audit. Approve the first push/Pages setup.
2. Authenticate GitHub and push main only after that approval. Check Windows CI/Pages.
3. Approve signing-secret setup and the first draft release, then dispatch the manual
   workflow. It creates Usagi-Setup-version.exe, SHA256SUMS.txt and usagi-stable.json
   (or beta), all under a draft. Private key material is removed from runner temp.
4. Review the candidate installer/feed and approve publication of the first release.
   Publishing the draft exposes the installer before Pages advertises it.
5. The published-release event rebuilds Pages from signed public release assets.
   Installed clients check this feed and can download/verify/restart into the update.

The feed builder never advertises drafts or missing installers. Expired historical
feeds cannot break current valid releases; expired latest channels are omitted.
Release feeds expire after 90 days, so publish a refreshed signed release before then.
No auto rollback is claimed; retain known-good installers and user data separately.

## Publication boundary

Excluded from the Git index: signing PEMs, .env files, protected accounts, local
runtime/caches/logs, raw machine-specific result JSON, local notes, original owner
image metadata and captures containing local settings paths. The necessary cropped
logo/icon and reviewed Home screenshot are public assets. The Microsoft client ID
and update verification public key are intentionally public and are not credentials.

The audit checks staged bytes for blocked paths and recognized credential patterns,
and requires manual diff review. It is not a guarantee that every possible secret
format can be detected. No Prism files, world saves or server configuration are included.
