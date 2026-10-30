# Link Discord from the Launcher

The existing Account page now includes **Link Discord**. This is separate from
Rich Presence and does not enable marketplace transactions.

1. Sign in using the Microsoft account that owns Minecraft Java.
2. Connect to the configured Usagi Social service.
3. Generate a code in Account → Link Discord.
4. In the configured Discord server, enter `/link claim code:CODE` privately.
5. Return to the Launcher, check the displayed Discord account ID and explicitly
   confirm it. Do not approve a request you did not initiate.

Codes expire after five minutes. The same Social session that generated the code
must approve it. Switching accounts clears the displayed code; changing sessions
requires a new code. Existing links are never replaced automatically. Use
`/link status` and `/link unlink` in Discord to manage an existing association.
Losing the approval response does not require another code: refresh the request
status before retrying. Never share the code or add tokens to configuration URLs.

The main process holds the Social session; the renderer may send only allowlisted
pairing actions. The Social owner verifies that session, derives the Minecraft
UUID itself, and authenticates requests to the backend. No bot secret enters the
Launcher. The backend shares the existing identity store with the in-game linking
flow and enforces uniqueness, revisions, expiry and persistent replay protection.

Owner configuration: the existing `social.baseUrl` product setting must point to
the canonical HTTPS Social service. That owner needs its dedicated
`USAGI_DISCORD_GATEWAY_SECRET`, `USAGI_DISCORD_CONTROL_GUILD_ID`, `NODE_ENV`, and
`USAGI_DISCORD_BACKEND_URL`. HTTPS is required in production; only development
loopback may use HTTP. Do not include backend secrets in config/usagi.json.
The UsagiBot local `npm run social` wrapper supplies this backend URL when linking
is enabled. Real Discord command registration requires explicit owner approval.

Build the Launcher and Social owner:

```powershell
Set-Location (Join-Path $env:USERPROFILE 'Documents\CelestiaLauncher')
npm install
npm test
npm run build
npm run build:social
npm start
```

With those builds present, exercise the isolated real Electron pairing flow:

```powershell
Set-Location (Join-Path $env:USERPROFILE 'Documents\UsagiBot')
npm run test:pairing-ui
```

This uses fresh test databases and a synthetic identity verifier, not saved
Microsoft accounts. A real-account staging review is still required before
production. Full backend protocol and activation details are in
`UsagiBot/docs/ACCOUNT-PAIRING-TRANSACTIONS.md` in the separate backend checkout.
