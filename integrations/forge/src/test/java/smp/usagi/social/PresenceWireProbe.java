package smp.usagi.social;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

public final class PresenceWireProbe {
    public static void main(String[] args) throws Exception {
        CountDownLatch ready = new CountDownLatch(1);
        try (BridgeConnection bridge = new BridgeConnection(System.getenv("SOCIAL_TEST_ORIGIN"), System.getenv("USAGI_BRIDGE_SECRET"), event -> {}, ready::countDown)) {
            bridge.start();if (!ready.await(15, TimeUnit.SECONDS)) throw new IllegalStateException("Bridge authentication timed out");
            JsonObject player = new JsonObject();player.addProperty("uuid", "11111111111111111111111111111111");player.addProperty("name", "TestAlpha");player.addProperty("dimension", "test:moon_garden");player.addProperty("joinedAt", System.currentTimeMillis());JsonArray players = new JsonArray();players.add(player);
            JsonObject event = new JsonObject();event.addProperty("id", "test-event");event.addProperty("name", "Test event");event.addProperty("text", "Test event");event.addProperty("startsAt", System.currentTimeMillis()-1000);event.addProperty("endsAt", System.currentTimeMillis()+60000);
            if (PresenceEvents.validate(event, System.currentTimeMillis()) == null) throw new IllegalStateException("Valid event rejected");
            JsonObject invalid = event.deepCopy();invalid.addProperty("startsAt", -1);if (PresenceEvents.validate(invalid, System.currentTimeMillis()) != null) throw new IllegalStateException("Negative event time accepted");
            invalid = event.deepCopy();invalid.addProperty("text", "  ");if (PresenceEvents.validate(invalid, System.currentTimeMillis()) != null) throw new IllegalStateException("Blank event text accepted");
            invalid = event.deepCopy();invalid.addProperty("startsAt", 1.5);if (PresenceEvents.validate(invalid, System.currentTimeMillis()) != null) throw new IllegalStateException("Fractional event time accepted");
            bridge.playerSnapshot(players, event).get(10, TimeUnit.SECONDS);System.out.println("JAVA_PRESENCE_COMPATIBILITY_PASSED");
        }
    }
}
