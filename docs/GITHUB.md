# GitHub hosting

Repository: https://github.com/yacemais/usagi-launcher. The owner approved the first
source push and Pages setup. Reviewed commit 9cee394 was pushed to main; Pages is
enabled with GitHub Actions as its source. The owner subsequently authorized
publishing 0.3.0 as a development prerelease. Its beta metadata is signed locally;
the private signing key is not uploaded to GitHub. Social deployment and live
Minecraft validation remain pending, independently of source/installer hosting.

## Authentication

GitHub CLI was authenticated as yacemais and repository ADMIN access was verified.
For future development environments, the
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

Official action releases are pinned to verified full commit IDs. The initial hosted
Pages build/deployment succeeded. The initial Windows run passed the publication
audit and 90 tests and built the installer, then failed when electron-builder tried
implicit CI publishing. Packaging scripts now explicitly set --publish never; the
manual draft-release workflow is the sole release writer. Corrected Windows run
40719183976 passed and uploaded the installer artifact; updated Pages run 40719183232
also succeeded. The downloaded installer's extracted application passed the local
production startup smoke test. See TESTING.md for results.
An installed-to-installed upgrade still requires a real release test.

## Deployment URLs

```text
https://yacemais.github.io/usagi-launcher/
https://yacemais.github.io/usagi-launcher/launcher/channels/stable.json
https://yacemais.github.io/usagi-launcher/news/index.json
https://github.com/yacemais/usagi-launcher/releases
```

The site, news JSON and owner wordmark were verified over HTTPS with status 200.
The 0.3.0 development release targets launcher/channels/beta.json. The stable channel
remains absent until a stable release is explicitly published. Select beta in
Updates > Usagi launcher to check development updates; default stable clients are
not moved to beta automatically. Publishing a prerelease triggers the Pages workflow,
which verifies its signed metadata before exposing the channel.
OAuth redirects to **http://localhost**, never to GitHub Pages.

## One-time owner setup after approving publication

Repository Actions and **Settings > Pages > Source: GitHub Actions** are enabled.
The prepared application signing key is local/ignored. Back it up privately. Its
public key is embedded in config/usagi.json; the private key is never staged.
To let trusted manual release builds sign metadata, put the matching private PEM
into an Actions secret named **USAGI_APP_SIGNING_KEY**. This is a secret-store upload,
not a source file; it must be reviewed/approved before being performed.

Do not generate a replacement key each release: existing installed clients trust
the current public key. No production Authenticode certificate is configured, so
Windows installers are development/unsigned even though their update feeds are signed.

## First release sequence

1. Completed: owner approved the source push/Pages setup after publication review.
2. Completed: authenticated, pushed main and enabled Pages. Check Windows CI results.
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
