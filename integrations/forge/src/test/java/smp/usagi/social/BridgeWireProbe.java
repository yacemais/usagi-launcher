package smp.usagi.social;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

public final class BridgeWireProbe {
    public static void main(String[] args) throws Exception {
        CountDownLatch ready=new CountDownLatch(1),replied=new CountDownLatch(1);AtomicReference<Throwable> failure=new AtomicReference<>();BridgeConnection[] reference=new BridgeConnection[1];
        try(BridgeConnection bridge=new BridgeConnection(System.getenv("SOCIAL_TEST_ORIGIN"),System.getenv("USAGI_BRIDGE_SECRET"),event -> {
            if(!event.has("event")||!"minecraft.message".equals(event.get("event").getAsString()))return;
            JsonObject message=event.getAsJsonObject("message");
            JsonObject ack=new JsonObject();ack.addProperty("op","ack");ack.addProperty("uuid","22222222222222222222222222222222");ack.addProperty("messageId",message.get("id").getAsString());
            JsonObject reply=new JsonObject();reply.addProperty("op","message");reply.addProperty("target",message.get("sender").getAsString());reply.addProperty("text","Reply from the real Java bridge transport.");reply.addProperty("clientId",UUID.randomUUID().toString());
            reference[0].request(ack).thenCompose(ignored -> reference[0].command(UUID.fromString("22222222-2222-2222-2222-222222222222"),reply)).whenComplete((result,error) -> {failure.set(error);replied.countDown();});
        },ready::countDown)){
            reference[0]=bridge;bridge.start();if(!ready.await(15,TimeUnit.SECONDS))throw new IllegalStateException("Java bridge did not authenticate.");
            JsonObject player=new JsonObject();player.addProperty("uuid","22222222222222222222222222222222");player.addProperty("name","TestBeta");JsonArray players=new JsonArray();players.add(player);JsonObject update=new JsonObject();update.addProperty("op","players");update.add("players",players);bridge.request(update).get(10,TimeUnit.SECONDS);
            JsonObject request=new JsonObject();request.addProperty("op","request");request.addProperty("target",System.getenv("SOCIAL_TEST_ALPHA_ID"));bridge.command(UUID.fromString("22222222-2222-2222-2222-222222222222"),request).get(10,TimeUnit.SECONDS);
            System.out.println("JAVA_BRIDGE_READY");System.out.flush();
            if(!replied.await(20,TimeUnit.SECONDS))throw new IllegalStateException("Java bridge received no private message.");if(failure.get()!=null)throw new IllegalStateException("Java bridge reply failed.");
            System.out.println("JAVA_BRIDGE_ROUND_TRIP_PASSED");
        }
    }
}
