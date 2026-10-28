# Security model

Electron enables sandboxing, context isolation and web security; disables renderer
Node integration, navigation, new windows and permissions; and serves bundled files
under an allowlisted local protocol with a restrictive Content Security Policy.
Production pages execute no remote JavaScript. Remote news is plain text, with
bounded image downloads converted to data URLs. IPC accepts only strict shared Zod
commands from the main window's trusted main frame. Renderer APIs expose no generic
filesystem, shell, process, credential or IPC channel access.

The main process owns Microsoft credentials and game tokens. DPAPI-backed safeStorage
protects the MSAL cache and local profiles. Sign-in is disabled when protected storage
is unavailable. The logger redacts token-shaped fields and registered session secrets.
Launch arguments are never logged. An OS administrator, malware running as the same
Windows user, or a debugger controlling the main process remains outside this boundary.
The Java game process necessarily receives its own official session token.

Java is started with an argument array and shell:false. Paths are not shell commands.
Only x64 Java 17 is accepted. The default Java and game metadata come from official
Mojang/Microsoft services; Forge comes from its official Maven service. These official
legacy resources use their upstream SHA-1 checksums plus TLS. Local installation
receipts use SHA-256; pack artifacts require SHA-256 and an Ed25519 signed manifest.

Downloads require HTTPS and public destination addresses. DNS results are validated
at connection creation and the validated result is used for that connection, including
redirect destinations. Size bounds, timeouts, checksum verification, bounded concurrency
and cancellation apply. No remote executable JavaScript is loaded into the UI. Mods
and KubeJS scripts are executable game content: a trusted publisher still must audit
every file and verify redistribution permission.

## Filesystem and crash recovery

User-configured game folders require an ownership marker and must be separate from
Prism and SMP development. Managed paths are validated for traversal, reserved Windows
names, streams, links and junctions. Only manifest-tracked files participate in deletion.
Untracked conflicts stop the update. Personal worlds, screenshots and seeded preferences
are not update targets.

Each update stages verified downloads, syncs backups, writes a prepared journal, then
replaces files and writes the new ledger and committed marker. Recovery restores the
previous files and ledger for a prepared transaction. It verifies backups and refuses
to overwrite an independently modified recovery target. A single launcher operation
and single application instance prevent competing ordinary update/launch operations.
Fatal download errors abort remaining workers and wait for them before releasing the
operation lock. Cancellation is deferred during commit/rollback.

This is recoverable multi-file replacement, not a transactional filesystem. File
content is fsynced before journal/rename boundaries, but directory metadata and Windows
storage caches can still be lost on power failure. Tests exercise interrupted journal
recovery, not physical power cuts or every antivirus/filesystem failure. Preserve
backups. If a conflict is reported, retain .celestia/ and game files and review hashes
before manual recovery. Do not delete the journal just to force PLAY.

Concurrent malicious filesystem changes between validation and open are not fully
prevented by Node path checks. The application assumes the owned game directory and
data folder are not being modified by an adversarial same-user process during updates.

## Release trust

The development installer is unsigned; no publisher certificate was supplied. Application self-updates use a separate Ed25519-signed feed and NSIS handoff, with optional pinned Authenticode publisher verification. See LAUNCHER_UPDATES.md. Public-key rotation remains a trusted manual/release operation.
No production endpoints, private keys, credentials or reference modpack binaries are
bundled. This build needs real account/game/server validation and independent security
review before a public production release. Dependency audit results are in TESTING.md.
