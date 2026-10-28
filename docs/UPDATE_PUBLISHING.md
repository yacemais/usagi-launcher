# Signed modpack update publishing

There is no production endpoint or pack release in this repository. Files under
examples use reserved example.invalid URLs and placeholder hashes. They must not be
configured as real releases. This launcher does not redistribute reference Prism mods.

## Establish trust

Create an Ed25519 key pair outside the source repository, build folder and public web
server. Protect the private key offline or in your release signing service. Export
the public key as SPKI PEM and give it to players through a trusted channel. Configure
the public key in Settings independently of downloading a manifest. HTTPS plus a
hash inside an untrusted manifest would not authenticate a compromised publisher.

No signing key is generated or bundled by default. Key rotation currently requires
an authenticated manual public-key change; there is no remote trust-key rotation.

## Prepare the approved client files

Audit redistribution permission and client compatibility for every mod/resource.
Do not publish world saves, server.properties, ops, allowlists, credentials, private
server config or server-only mods. An allowlist of extensions cannot identify every
secret inside an otherwise allowed config: the publisher must review contents.

Use only these top-level folders: mods, config, kubejs, defaultconfigs, resourcepacks.
No absolute paths, backslashes, `..`, Windows reserved names, alternate streams or
symlinks/junctions are allowed. The publisher helper checks the actual release folder
and every file hash/size before producing the signed envelope.

Start from examples/manifest.example.json. Set the exact versions, a unique increasing
integer sequence, version label, UTC publication and expiry dates. Compute byte sizes
and SHA-256 for every file. Use immutable public HTTPS artifact URLs. The client does
not support arbitrary executable files or private-network download servers.

`managed` means updates may replace that tracked file; changed originals are backed
up. `seed` means install only when absent and preserve personal edits. Use seed for
ordinary player preferences. Use managed only where pack compatibility requires it.
Mark optional client files with `optional:true`; players select exact optional paths
in Settings. Server-required files must not be optional.

## Sign and publish

```powershell
npm run build
node dist/tools/publish-manifest.cjs unsigned.json C:\Secure\celestia-signing.pem C:\ApprovedClientFiles signed.json
```

The helper validates the same schema, dates, URLs and path rules as the launcher,
then verifies each local file's size and SHA-256. It signs the exact UTF-8 JSON bytes
and outputs only `{ "payload": "base64...", "signature": "base64..." }`. It never
prints the key. Signatures cover the decoded payload bytes, not a reserialized copy.

Upload verified artifacts first, then atomically publish the signed envelope at the
configured HTTPS manifest URL. Keep old immutable artifacts for rollback/recovery.
Never reuse a sequence with different content. Lower sequences are rejected. To roll
back pack contents intentionally, publish the earlier files using a new sequence.
Test a release against an isolated owned game folder before announcing it.

## Client update behavior

The client validates signature, target versions, dates, sequence, paths and URL safety.
Only missing/changed selected files are downloaded, into per-transaction staging.
Downloads verify size and SHA-256 before replacement. Backups and a durable prepared
journal precede commit. Cancellation waits for downloads and is deferred during
commit/recovery. A restart rolls back a prepared interrupted transaction; a committed
journal is finalized without reapplying files.

Only unchanged files explicitly tracked as managed may be removed when absent from
the new selection. Modified removed files, untracked mods, seed preferences, worlds
and player resources remain. Untracked conflicts block an overwrite instead of
silently deleting the player's file. Existing signed installed releases can be
verified offline after manifest expiry; fetching a new expired release is rejected.

Backups and unused interrupted staging are retained for diagnosis. There is no
automatic backup pruning. See SECURITY.md for filesystem durability limits.
