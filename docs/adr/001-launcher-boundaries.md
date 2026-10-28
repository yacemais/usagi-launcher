# 001: Privileged backend, official identity, signed pack ownership

Status: accepted for development.

Use Electron's sandbox and context isolation with narrow validated IPC. React may
request operations but never receives tokens, filesystem primitives or process APIs.
Use MSAL device-code authentication for a public native app, followed by Xbox/XSTS,
Minecraft entitlement and profile verification. Cache Microsoft credentials only in
Windows-protected storage. No offline-account launch path exists.

XMCL's actual declarative install workflows resolve official runtime resources and
Forge processors. A custom downloader supplies checksum validation, cancellation
and real progress. Two packaging defects require narrow build aliases; document
them rather than patching installed dependencies.

Managed pack files belong to a signed Ed25519 manifest and a local ledger. Stage
downloads before a journaled replacement transaction. Seed settings and untracked
user files remain outside forced updates. The application never adopts Prism folders.

The Windows Java 17 launcher on the reference host loses characters outside its ANSI
code page. Source paths are handled as Unicode by Node, but Java's own bootstrap is
an external compatibility limit. Do not silently change system locale or pretend this
path works. Keep an ASCII runtime/game location until independently validated.
