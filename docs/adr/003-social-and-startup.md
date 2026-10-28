# Social service and startup

Continue the Electron/React launcher and its sandboxed, validated main-process IPC.
Use the original owner logo for a 2.2 second CSS splash over the normal application;
initialize services in parallel and remove animation/delay for reduced motion.

Social is three components: launcher main-process client and React page, an independent
Node 24 HTTPS/WebSocket service backed by SQLite WAL, and a server-only Forge
1.20.1/47.4.28 Java 17 bridge. A single service process owns the SQLite volume; use
regular backups and a TLS reverse proxy. GitHub Pages cannot host this backend.
Supabase is a viable alternative, but would add a hosted account and custom policies
without replacing the required trusted Forge bridge. SQLite keeps local deployment
and protocol tests reproducible without service credentials.

The backend verifies Minecraft Java entitlement/profile through official services
before creating launcher sessions. Never accept a client UUID as identity. A trusted
bridge authenticates with a server-only shared secret and supplies UUIDs from an
online-mode Minecraft server. Bridge-generated identities and launcher identities
merge on the same verified Minecraft UUID; no arbitrary linking endpoint exists.
Launcher auth remains gated by the pending Minecraft application approval.

Use durable message IDs, sender request IDs, per-recipient delivery/read state,
friend authorization and blocks on every send/history/delivery. Keep Minecraft
delivery acknowledgments distinct from user read state. Acknowledged delivery is
at least once across crashes; the bridge persists recent IDs to suppress replay.
Heartbeats expire presence leases; visibility filters outgoing presence. WebSocket
reconnect triggers a fresh snapshot and durable inbox replay.

Sequence: test splash independently; implement/test persistence and backend rules;
add realtime transport and launcher UI; implement/compile/test the Forge bridge;
run isolated protocol and Minecraft tests, package, then document remaining external
validation. No push, infrastructure deployment or release without new approval.
