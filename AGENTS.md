# Usagi Launcher development

Continue the existing Electron/React/TypeScript application. Read README.md,
DESIGN.md and docs/MODPACK_DISTRIBUTION.md before changing update behavior.
Preserve the legacy application ID, storage locations, IPC names, authentication,
gameplay identifiers and the Celestials currency. Do not bypass Minecraft API approval.

The official modpack source is the Prism instance
`%APPDATA%/PrismLauncher/instances/Celestia_SMP_Alpha_0.1_Prism_Bootstrap`.
Never write to, rename or delete that instance. Use tools/Prepare-Modpack.ps1 to
create a new staging directory under the ignored .scratch-runtime directory.

When the owner requests "Upload my modpack", "Publish the modpack", "Update the
modpack" or "Sync my Prism modpack to GitHub":

1. Read the current Prism instance and published signed baseline; prepare a new stage.
2. Reuse the hash-bound private review catalog. Changed files require a fresh review.
3. Resolve redistribution permissions, client compatibility and private-data findings.
   Use authorized upstream URLs when redistribution is prohibited. Do not mark an
   unknown license as permitted or omit required gameplay files to make review pass.
4. Generate/sign/validate the manifest, immutable asset list and changelog locally.
5. Show the exact release tag, target commit, changed/removed files, upload inventory,
   byte counts, SHA-256 values and any remaining limitations to the owner.
6. Ask for explicit approval of that concrete publication before any upload, draft,
   tag creation or release publication. A general request to prepare/sync is not that
   approval. Never push source commits without separate explicit authorization.
7. After approval, use tools/Publish-Modpack.ps1 with the matching reviewed stage;
   verify public asset availability and the Pages stable feed. Retain prior releases.

Keep all modpack binaries, private inventories, review catalogs and signing keys
outside Git history. Never print private keys, account information or tokens.
The public modpack key is pinned in config/usagi.json; keep its private key backed up.
Launcher releases use launcher-vX.Y.Z; modpack releases use modpack-vX.Y.Z.
Historic v0.x launcher tags remain supported. No test releases on the public repository.

Run npm test and npm run build after update changes. Exercise real Electron when
changing the UI or lifecycle. Use mocked releases and isolated game folders for
distribution tests; preserve production player data and the Prism source.
