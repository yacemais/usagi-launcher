package smp.usagi.social;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.mojang.logging.LogUtils;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import net.minecraft.ChatFormatting;
import net.minecraft.network.chat.Component;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.level.storage.LevelResource;
import net.minecraftforge.common.MinecraftForge;
import net.minecraftforge.event.RegisterCommandsEvent;
import net.minecraftforge.event.TickEvent;
import net.minecraftforge.event.entity.player.PlayerEvent;
import net.minecraftforge.event.server.ServerStartedEvent;
import net.minecraftforge.event.server.ServerStoppingEvent;
import net.minecraftforge.eventbus.api.SubscribeEvent;
import net.minecraftforge.fml.common.Mod;
import org.slf4j.Logger;

@Mod("usagisocial")
public final class UsagiSocial {
    private static final Logger LOG = LogUtils.getLogger();
    private final Map<UUID, String> replyTo = new HashMap<>();
    private final Map<UUID, Long> commandTimes = new HashMap<>();
    private final Map<UUID, Long> joinedAt = new HashMap<>();
    private BridgeConnection bridge;
    private MinecraftServer server;
    private Receipts receipts;
    private int ticks;

    public UsagiSocial() { MinecraftForge.EVENT_BUS.register(this); }
    @SubscribeEvent public void commands(RegisterCommandsEvent event) { SocialCommands.register(event.getDispatcher(), this); }
    @SubscribeEvent public void started(ServerStartedEvent event) {
        server = event.getServer(); String endpoint = System.getenv("USAGI_SOCIAL_URL"), secret = System.getenv("USAGI_BRIDGE_SECRET");
        if (endpoint == null || secret == null) { LOG.info("Usagi Social disabled: configure the server-only service URL and bridge secret."); return; }
        if (!server.usesAuthentication()) { LOG.error("Usagi Social refuses offline-mode servers. Enable online-mode=true to verify player identities."); return; }
        try {
            Path file = server.getWorldPath(LevelResource.ROOT).resolve("data/usagi-social-receipts.json"); receipts = new Receipts(file);
            bridge = new BridgeConnection(endpoint, secret, value -> server.execute(() -> delivery(value)), () -> server.execute(() -> players(null)));
            bridge.start();
        } catch (Exception error) { LOG.error("Usagi Social configuration or receipt storage is invalid. Bridge was not started."); }
    }
    @SubscribeEvent public void stopping(ServerStoppingEvent event) { if (bridge != null) bridge.close(); bridge = null; server = null; replyTo.clear(); commandTimes.clear(); joinedAt.clear(); }
    @SubscribeEvent public void login(PlayerEvent.PlayerLoggedInEvent event) { if (event.getEntity() instanceof ServerPlayer) {joinedAt.put(event.getEntity().getUUID(), System.currentTimeMillis());players(null);} }
    @SubscribeEvent public void dimension(PlayerEvent.PlayerChangedDimensionEvent event) { if (event.getEntity() instanceof ServerPlayer) players(null); }
    @SubscribeEvent public void logout(PlayerEvent.PlayerLoggedOutEvent event) { players(event.getEntity().getUUID()); replyTo.remove(event.getEntity().getUUID()); commandTimes.remove(event.getEntity().getUUID()); joinedAt.remove(event.getEntity().getUUID()); }
    @SubscribeEvent public void tick(TickEvent.ServerTickEvent event) { if (event.phase == TickEvent.Phase.END && ++ticks % 100 == 0) players(null); }
    private void players(UUID exclude) {
        if (server == null || bridge == null || !bridge.connected()) return;
        JsonArray list = new JsonArray();
        for (ServerPlayer player : server.getPlayerList().getPlayers()) {
            if (player.getUUID().equals(exclude)) continue;
            JsonObject value = new JsonObject(); value.addProperty("uuid", player.getUUID().toString().replace("-", "")); value.addProperty("name", player.getGameProfile().getName());value.addProperty("dimension", player.serverLevel().dimension().location().toString());value.addProperty("joinedAt", joinedAt.computeIfAbsent(player.getUUID(), ignored -> System.currentTimeMillis()));list.add(value);
        }
        bridge.players(list, PresenceEvents.current());
    }
    private void delivery(JsonObject value) {
        if (server == null || bridge == null || !value.has("event") || !"minecraft.message".equals(value.get("event").getAsString())) return;
        try {
            String raw = value.get("uuid").getAsString(); UUID uuid = parseUuid(raw); ServerPlayer player = server.getPlayerList().getPlayer(uuid);
            if (player == null) return;
            JsonObject message = value.getAsJsonObject("message"); String id = message.get("id").getAsString(); UUID.fromString(id);
            if (receipts.contains(id)) { bridge.acknowledge(raw, id); return; }
            String sender = value.getAsJsonObject("sender").get("username").getAsString(), text = message.get("text").getAsString();
            if (!sender.matches("[A-Za-z0-9_]{1,20}") || text.length() > 1000 || text.matches("(?s).*[\\p{Cntrl}&&[^\\n\\t]].*")) return;
            player.sendSystemMessage(Component.literal("[Usagi DM] ").withStyle(ChatFormatting.LIGHT_PURPLE).append(Component.literal(sender + ": " + text).withStyle(ChatFormatting.WHITE)));
            replyTo.put(uuid, message.get("sender").getAsString());
            receipts.record(id); bridge.acknowledge(raw, id);
        } catch (Exception ignored) { LOG.warn("Usagi Social could not validate or persist a private delivery; it remains queued."); }
    }
    static UUID parseUuid(String value) { if (!value.matches("[a-f0-9]{32}")) throw new IllegalArgumentException("Invalid UUID"); return UUID.fromString(value.substring(0,8)+"-"+value.substring(8,12)+"-"+value.substring(12,16)+"-"+value.substring(16,20)+"-"+value.substring(20)); }
    BridgeConnection connection(ServerPlayer player) {
        if (bridge == null || !bridge.connected()) throw new IllegalStateException("Usagi Social is disconnected. Ask the server owner to check its configuration.");
        long now = System.currentTimeMillis(), previous = commandTimes.getOrDefault(player.getUUID(), 0L); if (now - previous < 500) throw new IllegalStateException("Wait a moment before the next Social command."); commandTimes.put(player.getUUID(), now); return bridge;
    }
    String replyTarget(ServerPlayer player) { String id = replyTo.get(player.getUUID()); if (id == null) throw new IllegalStateException("No recent Usagi conversation. Use /usagi msg <player> <message>."); return id; }
    void remember(ServerPlayer player, String id) { replyTo.put(player.getUUID(), id); }
}
