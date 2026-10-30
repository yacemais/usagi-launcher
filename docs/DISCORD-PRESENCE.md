# Discord Rich Presence

The existing Launcher now has a separate main-process Rich Presence module.
It uses application **1565378499731263570**, the documented local IPC transport
and SET_ACTIVITY. No bot token or OAuth client secret is included in the Launcher.
The Discord desktop application must be running. This is independent of bot guild
registration and does not prove ownership of a Discord/Minecraft account pair.

## Enable and privacy

Open **Settings → Discord activity**. It is off by default. Enable the master
switch and explicitly choose game activity, dimension, player count, friend names
and events, then save. Local choices live in `discord-presence.json`, separate
from existing launcher/game settings and scoped by verified Minecraft UUID;
the signed-out launcher has its own scope. Account changes clear old activity.

When Social is connected, changes also update the existing Social profile's
central presence preferences. The effective policy is the intersection of device
and profile consent. Activity privacy changes therefore reach the Launcher while
another device cannot silently opt this device in. Invisible Social status hides
Discord activity. A failed profile update still preserves a local disable.

Without a configured Social service, explicit device consent permits basic
Launcher/Minecraft process presence. With Social configured, connect to it before
publishing this profile's activity. Game dimensions/counts/names/events always
require current authenticated server observations. Stale or disconnected sources
are cleared. AFK is supported as a trusted observation field; the native publisher
does not invent AFK status. The extended DND/friend-join system remains later work.

## Authoritative observations

The updated `usagi-social-forge-0.1.0.jar` publishes each online player's actual
namespaced dimension and join time every five seconds and on dimension/login/logout
events. It uses the existing authenticated server role. The owner sends a private
activity event only to the corresponding authenticated Launcher session. Other
players' names require accepted friendship and mutual explicit name consent.
New presence fields are negotiated through `rich_presence.v1`; legacy clients
keep their exact old snapshot structure. New clients continue general Social
operation against older owners, with Rich Presence unavailable.
The Forge transport negotiates the same capability and strips optional metadata
for legacy owners. If optional metadata is rejected it retries the original
player contract, preserving existing Minecraft messaging/online leases.

The source observation expires after 45 seconds. The session timestamp uses the
server-observed join time, resets for new game/account sessions, and is not reset
by changing dimensions. Vanilla dimensions have their usual labels; namespaced
modded dimensions get readable resource-path names. Unknown worlds are not
reported as Overworld. The main-process game lifecycle supplies only a generic
process state if no verified game observation exists.

Optional event configuration on the dedicated server:
`config/usagi-presence-event.json`, maximum 8 KiB. Fields are id, name, text,
startsAt, endsAt (UTC epoch milliseconds), optional assetKey. Only an event inside
its start/end window can override dimension text, after explicit event consent.
No configuration file is installed automatically.

Only official uploaded Discord artwork keys can be configured in the optional
product `presenceAssets` object (`largeImage`, `eventKeys`). Empty defaults omit
custom artwork instead of inventing an asset. Event artwork must be on the
allowlist. The app name/icon come from the official Discord application settings;
no portal changes or artwork upload are performed by build.

## Remote emergency stop

For managed hosting, set USAGI_DISCORD_CONTROL_GUILD_ID on Social and use the
existing separate Discord gateway credential. The backend posts HMAC-authenticated,
guild/environment-bound, timestamped policies to /v1/presence/policy. Durable
nonces and ordering reject replay, including after owner restart. Policy expires
after 65 seconds; the Launcher enforces the deadline locally. A fresh signed
policy is required after owner restart. /control rich_presence and global
maintenance update this policy independently of message delivery.

The local UsagiBot Social wrapper passes only the required Social credentials
and this nonsecret guild value. A standalone owner without managed configuration
uses per-player consent; backend emergency controls cannot reach an unconfigured
independent owner. Production must use the managed setup and TLS.

## Tests and build (PowerShell)

```powershell
Set-Location (Join-Path $env:USERPROFILE 'Documents\CelestiaLauncher')
npm test
npm run build
npm run build:social
npm run test:presence-gui
```

Native transport checks without starting Minecraft:

```powershell
Set-Location (Join-Path $env:USERPROFILE 'Documents\CelestiaLauncher\integrations\forge')
$env:JAVA_HOME = Join-Path $env:APPDATA 'PrismLauncher\java\java-runtime-gamma'
.\gradlew.bat build writeWireClasspath --console=plain
Set-Location (Join-Path $env:USERPROFILE 'Documents\CelestiaLauncher')
npm run test:presence-forge-wire
npm run test:forge-wire
```

The first check exercises actual Java WebSocket transport negotiation against
legacy, current and rejecting-owner fixtures. The second exercises the existing
Java/Launcher message round trip with a synthetic identity verifier. Neither
connects to Discord or uses a real player/world.

The Electron test uses an isolated user-data directory and a synthetic named
pipe, never the user's real Discord. It verifies opt-in/persistence, the public
application ID, rejected forged IPC and clearing on disable/quit. Unit/integration
tests cover actual local IPC framing/reconnect, privacy/account changes, source
observations, older clients and source failures. The Forge module builds with
Java 17 / Minecraft 1.20.1 / Forge 47.4.28; installing its updated JAR on an approved
staging server and real Discord profile inspection remain operator acceptance.

Official protocol reference: [Discord RPC](https://docs.discord.com/developers/topics/rpc).
Direct presence without bot authentication is documented in
[Setting Rich Presence](https://docs.discord.com/developers/discord-social-sdk/development-guides/setting-rich-presence#rich-presence-without-authentication).
