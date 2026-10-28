# Usagi Social server integration

Server only: Minecraft 1.20.1, Forge 47.4.28, Java 17. No mod is required on clients.
This is separate from Celestia Shop and adds no economy or item behavior.

## Build and install

1. Set JAVA_HOME to a Java 17 JDK. From this directory run gradlew.bat build on
   Windows or ./gradlew build on Linux. The pinned ForgeGradle version is 6.0.54;
   mappings are Mojang official 1.20.1 and the wrapper is Gradle 8.8.
2. Back up the staging server/world. Stop it and copy
   build/libs/usagi-social-forge-0.1.0.jar into its mods folder.
3. Set USAGI_SOCIAL_URL to the backend HTTPS origin and USAGI_BRIDGE_SECRET to the
   same private key configured on the backend. Supply these only through the server
   host's protected environment/secret store. HTTP is accepted only on loopback for
   local testing. Do not place the key in the distributed client pack.
4. Keep server.properties online-mode=true. The bridge refuses offline-mode servers;
   offline-mode proxy forwarding is not supported by this version.
5. Start the server. Check backend health and the launcher Social status. Connect an
   authenticated player; their UUID and verified game-profile name are sent from the
   server to the service. Heartbeats publish the real online player list.

The mod is optional when environment variables are absent: commands report that the
service is disconnected. A missing or invalid receipt file is handled conservatively;
review server storage rather than deleting delivery receipts to force replay.

## Private commands

| Command | Purpose |
| --- | --- |
| /usagi msg <player> <message> | Send to an accepted friend by Usagi or Minecraft name |
| /usagi reply <message> | Reply to the latest received/sent conversation this session |
| /usagi inbox | List conversations and unread counts |
| /usagi inbox <player> | Read the latest 20 messages and mark them read |
| /usagi friends | List friends/presence and incoming requests |
| /usagi friends add <player> | Send a request |
| /usagi friends accept/decline/cancel <player> | Manage a request |
| /usagi friends remove/block/unblock <player> | Manage a relationship |

Commands require an actual ServerPlayer; console cannot impersonate one. Friendship
and blocking are checked by the backend on every operation. No chat event forwards
global chat, and all outputs use private player messages or nonbroadcast failures.
Messages are plain text and never interpreted as commands or clickable actions.

Receipts are stored in world/data/usagi-social-receipts.json. The backend keeps the
complete history; the server file only suppresses recently delivered message IDs.
Back up both. A hard crash between displaying chat and persisting the ID can repeat
a delivery; stable IDs and normal reconnect deduplication do not remove that window.

## Verification

gradlew.bat runGameTestServer runs command-registration/console-authorization and
receipt-persistence tests. These do not impersonate authenticated online players.
gradlew.bat writeWireClasspath followed by npm run test:forge-wire at the launcher
root runs a Java transport round trip against a real local backend with explicit
test-only identities. This is distinct from seeing a DM inside a real client.
Use the live acceptance plan in ../../docs/SOCIAL.md before production deployment.
