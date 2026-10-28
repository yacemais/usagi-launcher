# Usagi test report

## GitHub publication verification

The owner authorized GitHub publication. Commit f0cc530 is tagged as the public
v0.3.0 development prerelease. Hosted Windows run 40742972818 passed its audit,
109 tests and NSIS build. All six release asset sizes and GitHub SHA-256 digests
matched the local reviewed files. Private signing keys remained local.

Release-triggered Pages run 40743821908 successfully built and verified the signed
beta feed, then GitHub blocked deployment from its tag due to the main-only Pages
environment rule. The workflow now dispatches release refreshes from main, with
branch guards and a regression check. Live beta-feed verification follows deployment.

## Local 0.3.0 Social and startup verification

The checks below were completed locally before publication. The owner subsequently
authorized GitHub publication as a development prerelease. No production Social
deployment has been performed. A pre-change source backup is retained under release/.

| Executed check | Result |
| --- | --- |
| Existing baseline | 95 tests passed before feature work |
| Full TypeScript/Vite/Electron compilation | Passed |
| Expanded automated suite | 109 tests in 13 files passed |
| Social persistence, permissions, blocks, visibility, offline inbox | Passed with SQLite and explicit test identities |
| HTTP/WebSocket round trip, replay rejection, unauthorized inbox, spam | Passed locally |
| Launcher reconnect and backend restart recovery | Passed with real local sockets/database |
| Social account cancellation and official-account refresh/logout lock | Passed |
| Actual Electron startup animation and reduced motion | Passed |
| Actual Social conversation/privacy UI at normal/minimum size | Passed against real local service with test-only identity verifier |
| Existing launcher navigation, sandbox, IPC and Windows protection | Passed |
| Production backend deployment entry point | Passed health/persistent DB creation and rejected UUID-only login; no test verifier |
| Standalone backend bundle with its locked production dependency | Passed the same health/authorization checks from its own deployment directory |
| Forge 47.4.28 / Java 17 build | Passed |
| Forge GameTests | 2 executed and passed: private command registration/console rejection, receipt restart persistence |
| Real Java BridgeConnection ↔ backend ↔ SocialClient round trip | Passed with test identities; acknowledgments persisted |
| Windows 0.3.0 NSIS build and packaged app startup | Passed; installer unsigned |

The final presence-privacy revision also passed all 13 Social tests and the Java
round trip again. No tokens, passwords, backend secrets or real account caches are
included in source/deployment artifacts. Captures labeled TestAlpha/TestBeta use
isolated test identities; their game presence is a test lease, not a live player.
Production entry points have no test-authentication endpoint or bypass.

**Not passed/claimed:** two authenticated clients sending/receiving private messages
inside Minecraft, live deployed WSS/host recovery, real OS Social notification delivery,
an installed-version upgrade, physical 60 FPS across GPUs, or the owner's full modpack
compatibility test. These need staging infrastructure, independent authenticated
clients and pending Minecraft API approval. Use the acceptance sequence in SOCIAL.md.
The Social system is not declared production operational.

## Live Microsoft authentication verification, 28 October 2026

After the owner registered http://localhost as a native/desktop redirect, live public
Microsoft authorization checks accepted portless and ephemeral-port localhost URIs.
The real MSAL protocol check passed authorization-code/S256 PKCE parameters for the
bundled Usagi client ID. Usagi supplies random state and nonce and reuses the same
redirect URI during the one-use code exchange.

Two actual launcher sign-in attempts used the owner's manual system-browser login,
first in the GitHub-built app, then in the compiled source app with safer diagnostics.
No mock authentication, borrowed client ID or client secret was used.

| Live step | Result |
| --- | --- |
| Microsoft browser login and code/PKCE exchange | Passed |
| Xbox Live authentication | Passed |
| XSTS authorization for Minecraft | Passed |
| Minecraft Services login_with_xbox | Failed: HTTP 403, Invalid app registration |
| Minecraft Java entitlement | Not reached |
| Minecraft profile retrieval | Not reached |
| Real saved-account refresh/logout | Not reached; no account was saved |

The failure exposed a diagnostic defect: the wrapper discarded the provider status
and registration denial. It now preserves only numeric HTTP/Xbox codes and recognized
error categories, logs completed service steps, and never logs raw provider payloads.
Compilation and **95 tests in 11 files** passed, including five new diagnostic/privacy
tests. Those unit fixtures are separate from the real-service attempts above.
An actual full sign-in cannot pass until Minecraft approves Usagi's API access.
The updated local Windows installer built successfully at
release/auth-check-0.2.1/Usagi-Setup-0.2.1.exe. Its packaged application passed the
startup/navigation/sandbox/Windows credential-protection smoke check. It remains
unsigned and is not a GitHub release. The local source archive includes this change;
no account cache, live auth logs or private signing key is included in source.

The sections below retain the earlier build/UI results and their test counts.

## Current 0.2.1 OAuth and GitHub preparation

The registered client ID ee966e53-e97c-46eb-b6ea-6de2cca23fd5 is integrated. The
expanded local suite passed **90 tests in 10 files**, including callback replay,
logout serialization, signed GitHub feed selection and workflow permission checks.
The real MSAL protocol probe generated a system-browser authorization-code URL using
live Microsoft metadata, S256 PKCE, the temporary localhost redirect, and scopes
XboxLive.signin, offline_access, openid and profile. It used no secret and deliberately
stopped before browser consent; no real account was authenticated by that probe.

A local Pages preview was built against the initially empty public repository,
correctly producing no invented signed update channel. After owner approval,
reviewed commit 9cee394 was pushed and Pages enabled. Hosted Pages run
40717548218 succeeded. HTTPS checks returned 200 for the site, news/index.json and
owner wordmark; the unpublished stable update channel correctly returned 404.
Initial hosted Windows run 40717548285 passed its audit and 90 tests and produced
the installer, then failed at electron-builder's implicit publishing step. Both
packaging scripts now explicitly disable publishing. Corrected Windows run
40719183976 at commit 862ccc6 passed all steps: publication audit, 90 tests, TypeScript
and renderer/main compilation, NSIS installer creation and artifact upload. Updated
Pages run 40719183232 also succeeded. The Windows development artifact was downloaded
from GitHub for local verification; it is not a published release. Its app payload
was extracted into an isolated project folder without running the installer, then
the actual GitHub-built Usagi.exe passed the production startup smoke test:
version 0.2.1, local production protocol, navigation, correct INSTALL state,
sandbox enabled, Windows credential protection available, and no renderer errors.
Interactive installer execution and installed-to-installed updates remain untested.
No GitHub release or signing-secret upload has occurred.
Raw protocol/machine JSON and private signing keys are excluded from publication.

The rebuilt Windows NSIS candidate is at release/candidate-0.2.1/Usagi-Setup-0.2.1.exe.
Actual Electron GUI checks passed for configured Microsoft sign-in controls, update
navigation, real owner branding, sandbox/isolation, rejected forged IPC, encrypted
credential round-trip, minimum window layout and keyboard/window controls. The
packaged 0.2.1 executable also passed production-protocol startup, navigation,
INSTALL state with missing game files, Windows credential protection and renderer
error checks. These checks did not authenticate an account or install an update.
The installer is not Authenticode signed. Local build success is not a hosted CI run.

The results below describe the preceding 0.2.0 baseline unless explicitly updated.

## Prior 0.2.0 report

Executed on Windows x64, 28 October 2026; Node 24.21.0, Electron 45.1.0, Java 17.0.15
for the official game installer. Tests use isolated application data. Prism, the
Shop project and quest files were not modified.

## Baseline and preservation

Before edits, **65 existing tests passed**. Current source/docs/assets/lockfile were
backed up as release/pre-usagi-backup-20261028-134631.zip. The earlier 0.1.0 installer
and source archive remain available. The game installer, signed modpack transactions,
user-data rules and secure Electron boundary were retained.

## Final executed results

| Check | Result |
| --- | --- |
| TypeScript + Vite + esbuild, including publishing tools | Passed, no compilation errors |
| Full Vitest suite | **82 passed, 8 files** |
| Existing modpack regressions | Passed: signatures, target versions, paths, corruption, missing-file repair, seeds, optional files, backups, managed deletions, ownership, recovery and junction rejection |
| Browser OAuth helper | Passed with actual local HTTP callback and mocked Microsoft token APIs: state rejection, S256 PKCE, nonce/state passed to exchange, cancellation/listener shutdown, Microsoft-only browser URLs |
| Account orchestration | Passed with explicit service mocks: entitlement failure, silent refresh checks, logout/restart, unknown account, unavailable storage, failed protected write and cancelled late result |
| Real Windows credential storage | Passed: asynchronous encrypt/decrypt round trip; legacy-name/synchronous ciphertext readable under Usagi with async storage |
| Launcher signed release validation | Passed: signature, product/channel, stable prerelease exclusion, expiry, safe installer filename, persisted sequence rollback rejection |
| Real electron-updater NSIS cache | Passed with real local HTTP and non-executable fixtures: download, cache reuse after service restart, checksum rejection, cancellation/retry, channel selection, pre-install tamper detection and busy-game install rejection |
| Privileged IPC validation | Passed: forged executable paths/URLs and offline authentication mode rejected |
| Settings migration | Passed: old settings retain the game folder and width; missing new channel becomes stable |
| Real child-process exit fixture | Passed: stderr/log capture, exit code 7 and idle recovery; this is not a Minecraft crash test |
| Real TCP server-list fixture | Passed: actual fixture counts/version, offline port, unconfigured state |
| Actual Electron UI | Passed: owner wordmark loaded, Usagi title, Home/News/Settings/Account, separate game/app update tabs, unconfigured source boundary, minimum window, keyboard focus and maximize/restore |
| Sandbox and renderer security | Passed: sandbox=true, contextIsolation=true, nodeIntegration=false, no renderer require/process, forged IPC rejected |
| Forced Chromium 125% / 150% scaling | Passed: navigation and no horizontal overflow; physical Windows multi-monitor scaling remains untested |
| Packaged Windows Usagi.exe | Passed from isolated working directory, without Vite: actual name/version, local production protocol, owner branding, navigation and protected storage availability |
| Packaged game-installer regression | Passed: existing official runtime verified after restart and Forge workflow executed; missing signed pack correctly keeps PLAY disabled |
| Pack and application release publishers | Passed with explicit test keys/payloads: signed output independently verified, actual hashes checked, changed pack content rejected; no production key generated |
| NSIS build | Usagi-Setup-0.2.0.exe built successfully, unsigned |
| Final npm audit | 0 reported vulnerabilities for the final lockfile; docs/audit-results.json |

The initial fresh official Minecraft/Forge/Java download and corrupt-asset restart/
repair passed in the preceding 0.1.0 work. Usagi's packaged regression reused that
isolated installed cache and ran the official installation workflow again. It is
not described as an authenticated Minecraft launch or a fresh modpack installation.

## Not executed

- **Real Microsoft sign-in/logout/refresh and Minecraft entitlement endpoints.** The
  owner confirmed that no Usagi Microsoft app has been registered. See MICROSOFT_AUTH.md.
- Authenticated game launch, actual game crash, two real authenticated accounts,
  production modpack/server connection or auto join. These need the registration,
  Java accounts, approved pack and server.
- **A real installed-version-to-newer-installed-version app upgrade.** Signed metadata,
  download/cache and install gating were exercised; fixture installers were never
  executed. NSIS quit/install handoff and rollback need a controlled deployment test.
- Production signed feeds, Authenticode publisher verification with a real certificate,
  SmartScreen reputation, installer install/uninstall, physical display scaling and
  physical power-cut durability. No production keys/endpoints/certificate were supplied.

## Known failing compatibility case

Arbitrary Unicode Java paths remain unresolved. The official Java 17 Windows runtime
failed to start from a folder containing 雪 and lost that character in classpaths on
this host. Relevant downloaded Java files matched their upstream hashes; the same
runtime worked from an ASCII path with spaces. Node's Unicode updater filesystem
tests pass, which does not establish Java bootstrap compatibility. See KNOWN_LIMITATIONS.md.

## Evidence and reproduction

JSON records under docs/: gui-results, scale-results, packaged-results,
packaged-core-results, credential-migration-results and publisher-results. The older
install-results/runtime-regression-results describe the original official install.
Screenshots are real Electron captures; screenshots/README.md identifies current and
historical images. Root usagi-*-run.log files contain local command output.

```powershell
npm ci
node node_modules/electron/install.js
npm run build
npm test
npm run test:gui
node tools/scale-test.mjs
node tools/publisher-test.mjs
npm run package:win
node tools/packaged-test.mjs
node tools/packaged-test.mjs --core
```

The --core test expects the isolated official runtime created by
tools/install-gui-test.mjs. Never point development test tools at live player data.
Test-only HTTP transport/service mocks are not exposed through production IPC.
