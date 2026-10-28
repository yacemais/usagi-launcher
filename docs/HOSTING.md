# Exact hosting layout for Usagi

Current owner choice: **https://github.com/yacemais/usagi-launcher**. GitHub Releases
and Pages workflows are installed; see GITHUB.md. The first source push and Pages
deployment were approved and completed. The owner has also authorized the 0.3.0
development prerelease, using the beta update channel and local metadata signing.

Selected setup: **GitHub Releases for launcher installers** and **GitHub Pages for
signed update feeds, news JSON, changelog and the public website**. Bulk modpack
artifacts can use immutable GitHub Release assets when redistribution is permitted;
R2 is an optional alternative for larger packs. The small Pages site is live.

## 1. Launcher binaries: GitHub Releases

Use yacemais/usagi-launcher. For release 0.2.1, upload the actual
built **Usagi-Setup-0.2.1.exe** as a release asset. Retain old release assets;
do not replace files at an existing version URL. The installer may alternatively live
in an immutable R2 object if the project should not have a public release repository.

```text
GitHub release v0.2.1/
  Usagi-Setup-0.2.1.exe         required installer
  SHA256SUMS.txt               recommended human verification
  usagi-stable.json            signed channel envelope
  Source code.zip / .tar.gz    supplied automatically by GitHub from the tag
```

The actual release URL goes into installer.url in the unsigned app-release template.
Sign that template with the **application** release key after building and uploading
the identical installer. Usagi downloads full NSIS installers, so **.blockmap is not
required** by this adapter; **latest.yml is not consumed**. Do not serve the unpacked
directory as an update package.

GitHub's documented release-asset limits should be checked for your release process:
https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases

## 2. Modpack files: R2 object storage

Create a bucket and attach an owner-controlled custom domain. Public client artifacts
should be immutable, with ordinary HTTPS GET and Content-Length support. Use strong
upload credentials in the release service only; none go in Usagi or the manifest.

```text
R2 bucket / custom-domain root/
  modpacks/
    celestia/
      0.1.0/
        mods/
          owner-approved-mod-a.jar
          owner-approved-mod-b.jar
        config/
          pack-managed-config.json
        defaultconfigs/
          example.toml
        kubejs/
          client_scripts/owner-approved-script.js
        resourcepacks/
          owner-approved-pack.zip
```

The version here is an example pack version, independent of Usagi 0.2.1. Only include
approved client files and check each mod/resource's redistribution permission. Do not
copy the whole Prism instance or distribute worlds, accounts, logs, server secrets,
server.properties, operators or private server configuration.

Build a complete signed pack manifest with its version, sequence, file URLs, byte
sizes, SHA-256, managed/seed policy and optional flags. Its URLs point at these R2
objects. The existing pack updater downloads only missing/changed selected files,
checks hashes, stages replacement and preserves player data. Publishing just a mods
ZIP is not a substitute for this manifest.

Serve immutable artifact paths with a long cache lifetime, for example
`Cache-Control: public, max-age=31536000, immutable`. Never reuse an object path for
different bytes. Keep old objects while clients or rollback releases may need them.

R2 custom-domain/public-bucket and upload references:
- https://developers.cloudflare.com/r2/buckets/public-buckets/
- https://developers.cloudflare.com/r2/objects/upload-objects/

## 3. Feeds, news and changelog: GitHub Pages

The Pages workflow copies **deploy/site/public/** to _site, then discovers published
GitHub releases and verifies their signed application feeds before adding them.
It never advertises a draft or missing installer. Enable Pages with GitHub Actions
as its source after approving the first publication. The target site is
https://yacemais.github.io/usagi-launcher/ with this structure:

```text
deploy/site/
  vercel.json
  public/
    launcher/
      channels/
        stable.json                 signed APP release envelope
        beta.json                   optional signed APP release envelope
    modpacks/
      celestia/
        stable.json                 signed MODPACK manifest envelope
    news/
      index.json                    plain news feed, {"items": [...]} or empty
      images/
        owner-supplied-image.webp    optional, licensed non-AI artwork only
    changelog.md                    actual written release notes
```

The two stable.json files are different schemas signed by their corresponding keys.
The application channel is generated from verified published release assets. A real
signed modpack manifest must be prepared separately; none is configured yet.
Publish immutable binaries/pack objects before the corresponding feed. Pages controls
its caching; changing vercel.json does not configure GitHub Pages cache headers.
Pages is for the small site/feeds, not bulk pack binaries (1 GB site and soft bandwidth
limits): https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits.

Vercel remains an optional alternative for small static JSON/text and the public website;
deploy/site/vercel.json is provided for that alternative. Its static
upload/deployment, request, transfer and function limits are plan-dependent. Keep
large frequently downloaded game artifacts in object storage; do not proxy installers
or a modpack through Vercel Functions. Do not use a Vercel function's local filesystem
as persistent modpack storage. Vercel is not where the Minecraft Java game server runs.
See https://vercel.com/docs/limits and https://vercel.com/docs/functions/limitations.

## 4. Configure the application

The registered client ID, application verification key and GitHub target URLs are
already bundled. Modpack signing/hosting and the server still need owner configuration.

```text
config/usagi.json
  microsoftClientId                  owner Usagi registration GUID
  launcherUpdates.baseUrl             https://yacemais.github.io/usagi-launcher/launcher/channels/
  launcherUpdates.publicKey           app Ed25519 PUBLIC PEM
  launcherUpdates.publisherNames      real Authenticode publishers, if signed
  modpack.manifestUrl                 https://YOUR-SITE/modpacks/celestia/stable.json
  modpack.publicKey                   pack Ed25519 PUBLIC PEM
  newsUrl                            https://yacemais.github.io/usagi-launcher/news/index.json
  server.host / server.port           actual Minecraft server, separate hosting
```

Rebuild and manually install this configured release once so clients have the app
update key. A development build with a blank trust key cannot securely discover a
new key just from an untrusted remote server. News links may point at the static
changelog or an owner's website page. No executable remote JavaScript is rendered.

## 5. Files that must never be hosted

Private signing PEMs, Microsoft client secrets, accounts.protected, settings with
personal paths, application data, the live Prism instance, user worlds/screenshots,
and server-only/private configuration. `config/usagi.json` contains public build
coordinates only and is bundled into the application, not used as a remote trust source.

The reviewed source and Pages site are published. No release or live Minecraft
server change has been performed. Run the release and real-account validation
checklist in TESTING.md before claiming the launcher is production ready.
