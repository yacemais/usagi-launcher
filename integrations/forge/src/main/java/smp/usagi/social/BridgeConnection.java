package smp.usagi.social;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.WebSocket;
import java.time.Duration;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.function.Consumer;

public final class BridgeConnection implements WebSocket.Listener, AutoCloseable {
    private final URI uri;
    private final String secret;
    private final Consumer<JsonObject> event;
    private final Runnable ready;
    private final ScheduledExecutorService worker = Executors.newSingleThreadScheduledExecutor(r -> {
        Thread thread = new Thread(r, "usagi-social"); thread.setDaemon(true); return thread;
    });
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).executor(worker).build();
    private final Map<String, CompletableFuture<JsonObject>> pending = new ConcurrentHashMap<>();
    private final StringBuilder buffer = new StringBuilder();
    private volatile WebSocket socket;
    private volatile boolean connected;
    private volatile boolean presenceCapable;
    private volatile boolean closed;
    private boolean retryScheduled;
    private CompletableFuture<Void> sendQueue = CompletableFuture.completedFuture(null);
    private int attempts;

    public BridgeConnection(String endpoint, String secret, Consumer<JsonObject> event, Runnable ready) {
        URI base = URI.create(endpoint);
        boolean local = "http".equals(base.getScheme()) && ("127.0.0.1".equals(base.getHost()) || "localhost".equals(base.getHost()));
        if ((!"https".equals(base.getScheme()) && !local) || base.getUserInfo() != null || base.getQuery() != null || base.getFragment() != null || base.getHost() == null || (!base.getPath().isEmpty() && !"/".equals(base.getPath()))) throw new IllegalArgumentException("Use an HTTPS Social origin (HTTP loopback only for local tests).");
        if (secret.length() < 32 || secret.length() > 200) throw new IllegalArgumentException("Set the server-only Usagi bridge secret.");
        this.uri = URI.create((local ? "ws" : "wss") + "://" + base.getRawAuthority() + "/v1/realtime");
        this.secret = secret; this.event = event; this.ready = ready;
    }
    public void start() { worker.execute(this::connect); }
    public boolean connected() { return connected; }
    private synchronized void connect() {
        retryScheduled = false;
        if (closed) return;
        http.newWebSocketBuilder().connectTimeout(Duration.ofSeconds(12)).buildAsync(uri, this).whenComplete((ws, error) -> {
            if (closed && ws != null) ws.abort();
            else if (error != null) retry();
        });
    }
    private synchronized void retry() {
        connected = false;
        pending.values().forEach(f -> f.completeExceptionally(new IllegalStateException("Social disconnected. Try again."))); pending.clear();
        if (!closed && !retryScheduled) { retryScheduled = true; worker.schedule(this::connect, Math.min(30, 1 << Math.min(attempts++, 5)), TimeUnit.SECONDS); }
    }
    @Override public void onOpen(WebSocket webSocket) {
        socket = webSocket;presenceCapable = false;buffer.setLength(0); sendQueue = CompletableFuture.completedFuture(null);
        JsonObject auth = new JsonObject(); auth.addProperty("type", "authenticate"); auth.addProperty("role", "server"); auth.addProperty("token", secret);
        webSocket.sendText(auth.toString(), true); webSocket.request(1);
    }
    @Override public java.util.concurrent.CompletionStage<?> onText(WebSocket webSocket, CharSequence text, boolean last) {
        if (buffer.length() + text.length() > 512000) { webSocket.abort(); return null; }
        buffer.append(text);
        if (last) {
            try {
                JsonObject value = JsonParser.parseString(buffer.toString()).getAsJsonObject();
                if (value.has("event")) {
                    if ("ready".equals(value.get("event").getAsString())) { connected = true; attempts = 0; negotiatePresence(); }
                    else event.accept(value);
                } else if (value.has("id")) {
                    CompletableFuture<JsonObject> future = pending.remove(value.get("id").getAsString());
                    if (future != null) {
                        if (value.has("ok") && value.get("ok").getAsBoolean()) future.complete(value);
                        else future.completeExceptionally(new IllegalStateException(value.has("error") ? value.get("error").getAsString() : "Social request failed."));
                    }
                }
            } catch (Exception ignored) { webSocket.abort(); }
            buffer.setLength(0);
        }
        webSocket.request(1); return null;
    }
    @Override public java.util.concurrent.CompletionStage<?> onClose(WebSocket webSocket, int status, String reason) { if (webSocket == socket) retry(); return null; }
    @Override public void onError(WebSocket webSocket, Throwable error) { if (webSocket == socket || socket == null) retry(); }
    private synchronized void send(JsonObject rpc, CompletableFuture<JsonObject> future) {
        WebSocket active = socket;
        sendQueue = sendQueue.handle((result, error) -> null).thenCompose(ignored -> active.sendText(rpc.toString(), true)).thenAccept(ignored -> {}).exceptionally(error -> { future.completeExceptionally(new IllegalStateException("Could not send to Social.")); return null; });
    }
    public CompletableFuture<JsonObject> request(JsonObject action) {
        if (!connected || socket == null) return CompletableFuture.failedFuture(new IllegalStateException("Usagi Social is disconnected. Try again shortly."));
        String id = UUID.randomUUID().toString(); JsonObject rpc = new JsonObject(); rpc.addProperty("id", id); rpc.add("action", action);
        CompletableFuture<JsonObject> future = new CompletableFuture<>(); pending.put(id, future);
        send(rpc, future);
        return future.orTimeout(12, TimeUnit.SECONDS).whenComplete((result, error) -> pending.remove(id));
    }
    public CompletableFuture<JsonObject> command(UUID player, JsonObject action) {
        JsonObject request = new JsonObject(); request.addProperty("op", "command"); request.addProperty("uuid", player.toString().replace("-", "")); request.add("action", action); return request(request);
    }
    private void negotiatePresence() {
        WebSocket active = socket;JsonObject action = new JsonObject();action.addProperty("op", "capabilities");JsonArray features = new JsonArray();features.add("rich_presence.v1");action.add("features", features);
        request(action).whenComplete((result, error) -> {
            if (closed || !connected || socket != active) return;
            presenceCapable = false;
            if (error == null) try {for (var feature : result.getAsJsonObject("data").getAsJsonArray("features")) if ("rich_presence.v1".equals(feature.getAsString())) presenceCapable = true;} catch (Exception ignored) {}
            ready.run();
        });
    }
    public void players(JsonArray players) { players(players, null); }
    public void players(JsonArray players, JsonObject event) { playerSnapshot(players, event).exceptionally(error -> null); }
    public CompletableFuture<JsonObject> playerSnapshot(JsonArray players, JsonObject event) {
        boolean metadata = presenceCapable;WebSocket active = socket;
        JsonArray payload = players;
        if (!metadata) {payload = new JsonArray();for (var raw : players) {JsonObject legacy = new JsonObject();legacy.add("uuid", raw.getAsJsonObject().get("uuid"));legacy.add("name", raw.getAsJsonObject().get("name"));payload.add(legacy);}}
        JsonObject action = new JsonObject();action.addProperty("op", "players");action.add("players", payload);if (metadata && event != null) action.add("event", event);
        return request(action).exceptionallyCompose(error -> {if (!metadata || socket != active) return CompletableFuture.failedFuture(error);presenceCapable = false;return playerSnapshot(players, null);});
    }
    public void acknowledge(String uuid, String id) { JsonObject action = new JsonObject(); action.addProperty("op", "ack"); action.addProperty("uuid", uuid); action.addProperty("messageId", id); request(action).exceptionally(error -> null); }
    @Override public void close() { closed = true; connected = false; if (socket != null) socket.abort(); pending.values().forEach(f -> f.cancel(false)); pending.clear(); worker.shutdownNow(); }
}
