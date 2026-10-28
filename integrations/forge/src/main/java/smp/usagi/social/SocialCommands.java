package smp.usagi.social;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.mojang.brigadier.CommandDispatcher;
import com.mojang.brigadier.arguments.StringArgumentType;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.function.Function;
import net.minecraft.ChatFormatting;
import net.minecraft.commands.CommandSourceStack;
import net.minecraft.commands.Commands;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerPlayer;

public final class SocialCommands {
    private SocialCommands() {}
    public static void register(CommandDispatcher<CommandSourceStack> dispatcher, UsagiSocial social) {
        var root = Commands.literal("usagi").requires(source -> source.getEntity() instanceof ServerPlayer);
        root.then(Commands.literal("msg").then(Commands.argument("player", StringArgumentType.word()).then(Commands.argument("message", StringArgumentType.greedyString()).executes(c -> run(c.getSource(), social, (bridge, player) -> send(bridge, player, social, StringArgumentType.getString(c,"player"), StringArgumentType.getString(c,"message"), false))))));
        root.then(Commands.literal("reply").then(Commands.argument("message", StringArgumentType.greedyString()).executes(c -> run(c.getSource(), social, (bridge, player) -> send(bridge, player, social, social.replyTarget(player), StringArgumentType.getString(c,"message"), true)))));
        var inbox=Commands.literal("inbox").executes(c -> run(c.getSource(), social, (bridge, player) -> snapshot(bridge, player).thenAccept(data -> onPlayer(player, () -> {
            privateText(player,"Private conversations:"); for (JsonElement item : data.getAsJsonArray("friends")) { JsonObject user = item.getAsJsonObject(); privateText(player,user.get("username").getAsString()+": "+user.get("unread").getAsInt()+" unread"); }
            privateText(player,"Read a conversation with /usagi inbox <player>.");
        }))));
        inbox.then(Commands.argument("player",StringArgumentType.word()).executes(c -> run(c.getSource(),social,(bridge,player) -> target(bridge,player,StringArgumentType.getString(c,"player")).thenCompose(id -> {
            JsonObject history=action("history");history.addProperty("target",id);return bridge.command(player.getUUID(),history).thenAccept(result -> onPlayer(player,() -> {
                JsonArray messages=result.getAsJsonArray("data");long through=0;
                for(int index=Math.max(0,messages.size()-20);index<messages.size();index++){JsonObject message=messages.get(index).getAsJsonObject();through=Math.max(through,message.get("seq").getAsLong());privateText(player,java.time.Instant.ofEpochMilli(message.get("createdAt").getAsLong())+" "+message.get("text").getAsString());}
                if(through>0){JsonObject read=action("read");read.addProperty("target",id);read.addProperty("through",through);bridge.command(player.getUUID(),read).exceptionally(error -> null);}
            }));
        }))));root.then(inbox);
        var friends = Commands.literal("friends").executes(c -> run(c.getSource(), social, (bridge, player) -> snapshot(bridge,player).thenAccept(data -> onPlayer(player,() -> {
            privateText(player,"Usagi friends:"); for (JsonElement item : data.getAsJsonArray("friends")) { JsonObject user=item.getAsJsonObject();privateText(player,user.get("username").getAsString()+" — "+user.get("presence").getAsString()); }
            for (JsonElement item : data.getAsJsonObject("requests").getAsJsonArray("incoming")) privateText(player,"Friend request: "+item.getAsJsonObject().get("username").getAsString()+". /usagi friends accept <name>");
        }))));
        for (String operation : new String[]{"add","accept","decline","cancel","remove","block","unblock"}) {
            friends.then(Commands.literal(operation).then(Commands.argument("player",StringArgumentType.word()).executes(c -> run(c.getSource(), social,(bridge,player) -> target(bridge,player,StringArgumentType.getString(c,"player")).thenCompose(id -> {
                JsonObject action=action("add".equals(operation)?"request":operation);action.addProperty("target",id);return bridge.command(player.getUUID(),action);
            }).thenAccept(result -> onPlayer(player,() -> privateText(player,"Usagi friend request/settings updated.")))))));
        }
        root.then(friends); dispatcher.register(root);
    }
    private interface Work { CompletableFuture<?> apply(BridgeConnection bridge, ServerPlayer player); }
    private static int run(CommandSourceStack source, UsagiSocial social, Work work) {
        try {
            ServerPlayer player=source.getPlayerOrException();BridgeConnection bridge=social.connection(player);
            work.apply(bridge,player).exceptionally(error -> { onPlayer(player,() -> privateText(player, safeError(error)));return null; });return 1;
        } catch (Exception error) { source.sendFailure(Component.literal(safeError(error)));return 0; }
    }
    private static String safeError(Throwable error) {
        Throwable value=error;while(value.getCause()!=null)value=value.getCause();String text=value.getMessage();
        if(value instanceof IllegalStateException && text!=null && text.length()<400)return text;
        return "Usagi Social could not complete that request. Try again shortly.";
    }
    private static CompletableFuture<Void> send(BridgeConnection bridge, ServerPlayer player, UsagiSocial social, String name, String text, boolean reply) {
        if (text.isBlank() || text.length()>1000 || text.matches("(?s).*[\\p{Cntrl}&&[^\\n\\t]].*")) return CompletableFuture.failedFuture(new IllegalStateException("Messages must contain 1–1000 characters."));
        CompletableFuture<String> resolved=reply?CompletableFuture.completedFuture(name):target(bridge,player,name);
        return resolved.thenCompose(id -> {
            JsonObject action=action("message");action.addProperty("target",id);action.addProperty("text",text);action.addProperty("clientId",UUID.randomUUID().toString());
            return bridge.command(player.getUUID(),action).thenAccept(result -> onPlayer(player,() -> { social.remember(player,id);privateText(player,"To "+(reply?"your conversation":name)+": "+text); }));
        });
    }
    private static CompletableFuture<JsonObject> snapshot(BridgeConnection bridge,ServerPlayer player) { return bridge.command(player.getUUID(),action("snapshot")).thenApply(result -> result.getAsJsonObject("data")); }
    private static CompletableFuture<String> target(BridgeConnection bridge, ServerPlayer player, String name) {
        if(!name.matches("[A-Za-z0-9_]{1,20}"))return CompletableFuture.failedFuture(new IllegalStateException("Enter a Usagi or Minecraft username."));
        return snapshot(bridge,player).thenCompose(data -> {
            JsonArray users=new JsonArray();users.addAll(data.getAsJsonArray("friends"));users.addAll(data.getAsJsonArray("blocked"));users.addAll(data.getAsJsonObject("requests").getAsJsonArray("incoming"));users.addAll(data.getAsJsonObject("requests").getAsJsonArray("outgoing"));
            for(JsonElement element:users){JsonObject user=element.getAsJsonObject();if(name.equalsIgnoreCase(user.get("username").getAsString())||name.equalsIgnoreCase(user.get("minecraftName").getAsString()))return CompletableFuture.completedFuture(user.get("id").getAsString());}
            JsonObject search=action("search");search.addProperty("name",name);return bridge.command(player.getUUID(),search).thenApply(result -> {
                JsonArray found=result.getAsJsonArray("data");if(found.size()!=1)throw new IllegalStateException("Player not found or not discoverable.");return found.get(0).getAsJsonObject().get("id").getAsString();
            });
        });
    }
    private static JsonObject action(String op) { JsonObject result=new JsonObject();result.addProperty("op",op);return result; }
    private static void onPlayer(ServerPlayer player,Runnable task) { if(player.getServer()!=null)player.getServer().execute(() -> { if(!player.hasDisconnected())task.run(); }); }
    private static void privateText(ServerPlayer player,String text) { player.sendSystemMessage(Component.literal("[Usagi] ").withStyle(ChatFormatting.LIGHT_PURPLE).append(Component.literal(text).withStyle(ChatFormatting.WHITE))); }
}
