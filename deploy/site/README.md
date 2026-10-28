# Static deployment scaffold

Deploy this directory as the site root. It contains no installer, mods, credentials,
signing keys or configured production channel. Generate signed channel files using
the owner keys before adding them under public/launcher/channels and
public/modpacks/celestia. Do not upload unsigned example templates as live feeds.

The selected GitHub Pages workflow builds this public directory and adds verified
feeds from published GitHub Releases. See ../../docs/GITHUB.md for approval and setup.
Vercel is an alternative: use its Other preset with public as the output directory
and no application build command. The public/news/index.json starts with an empty feed.
See ../../docs/HOSTING.md for exact artifact hosting and URLs to configure.
