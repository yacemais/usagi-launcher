package smp.usagi.social;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.nio.file.Files;
import net.minecraftforge.fml.loading.FMLPaths;

public final class PresenceEvents {
    private PresenceEvents() {}
    public static JsonObject current() {
        try {
            var file = FMLPaths.CONFIGDIR.get().resolve("usagi-presence-event.json");
            if (!Files.isRegularFile(file) || Files.size(file) > 8192) return null;
            return validate(JsonParser.parseString(Files.readString(file)).getAsJsonObject(), System.currentTimeMillis());
        } catch (Exception error) { return null; }
    }
    static JsonObject validate(JsonObject value, long now) {
        try {
            if (!value.keySet().stream().allMatch(key -> java.util.Set.of("id", "name", "text", "startsAt", "endsAt", "assetKey").contains(key))) return null;
            if (!value.getAsJsonPrimitive("startsAt").isNumber() || !value.getAsJsonPrimitive("endsAt").isNumber()) return null;
            long start = value.get("startsAt").getAsBigDecimal().longValueExact(), end = value.get("endsAt").getAsBigDecimal().longValueExact();
            String name = value.get("name").getAsString().strip(), text = value.get("text").getAsString().strip();
            if (start < 0 || start > now || end <= now || end <= start || !value.get("id").getAsString().matches("[a-z0-9_-]{1,64}") || name.isEmpty() || name.length() > 80 || text.length() < 2 || text.length() > 128 || name.chars().anyMatch(Character::isISOControl) || text.chars().anyMatch(Character::isISOControl) || value.has("assetKey") && !value.get("assetKey").getAsString().matches("[a-zA-Z0-9_-]{1,128}")) return null;
            JsonObject result = new JsonObject();result.addProperty("id", value.get("id").getAsString());result.addProperty("name", name);result.addProperty("text", text);result.addProperty("startsAt", start);result.addProperty("endsAt", end);if (value.has("assetKey")) result.addProperty("assetKey", value.get("assetKey").getAsString());return result;
        } catch (Exception error) { return null; }
    }
}
