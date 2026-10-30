# Usagi Social backend

Node 24.21.x, one persistent SQLite WAL volume, ws 8.22.0. The root build bundles
shared validation and application code into dist/main.cjs. ws remains a pinned
runtime dependency; install with npm ci --omit=dev --ignore-scripts here.

Set USAGI_BRIDGE_SECRET (random 32–200 characters), USAGI_SOCIAL_DB (absolute private
database path), HOST=127.0.0.1 and PORT=8787, then run node dist/main.cjs. Place a TLS
reverse proxy in front; see the Caddy and systemd example files. Do not expose public
unencrypted HTTP or put the server secret inside Electron or a Minecraft client.

Official Minecraft Java sessions are verified through Minecraft Services before
issuing a service session. The deployed entry point has no test-login endpoint.
Pending application approval still prevents real Usagi login.

Full deployment, identity, backup/recovery and acceptance instructions are in
../../docs/SOCIAL.md in the source tree, or DEPLOYMENT.md in the deployment bundle.
The bundle includes FORGE-INSTALL.md; relative source links in those documents refer
to the complete source archive. No infrastructure is provisioned by this
bundle and no production URL has been invented. ws is MIT licensed; WS-LICENSE.txt
is included. Bundled Zod is MIT; see ZOD-LICENSE.txt.

## Launcher Discord pairing

The optional `POST /v1/discord/pairing` route uses a verified Minecraft Social
session. It derives UUID/session binding server-side and delegates only strict
pairing actions to the Usagi backend. Configure `USAGI_DISCORD_BACKEND_URL`,
`USAGI_DISCORD_CONTROL_GUILD_ID`, `NODE_ENV` and the existing dedicated
`USAGI_DISCORD_GATEWAY_SECRET` on this owner. The backend independently checks
the HMAC audience/path, guild/environment, time, nonce and request schema.
Production requires HTTPS; no bot token belongs here. Keep economy writes disabled.
See `../../docs/DISCORD-ACCOUNT-LINKING.md` for setup and staging limits.
