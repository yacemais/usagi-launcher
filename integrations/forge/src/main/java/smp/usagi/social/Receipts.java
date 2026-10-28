package smp.usagi.social;

import com.google.gson.Gson;
import com.google.gson.reflect.TypeToken;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.LinkedHashSet;
import java.util.Set;

public final class Receipts {
    private final Path file;
    private final Set<String> ids = new LinkedHashSet<>();
    private final Gson gson = new Gson();

    public Receipts(Path file) throws Exception {
        this.file = file;
        if (Files.exists(file)) {
            Set<String> loaded = gson.fromJson(Files.readString(file), new TypeToken<LinkedHashSet<String>>() {}.getType());
            if (loaded != null) ids.addAll(loaded);
        }
    }
    public synchronized boolean contains(String id) { return ids.contains(id); }
    public synchronized void record(String id) throws Exception {
        ids.add(id);
        while (ids.size() > 10000) ids.remove(ids.iterator().next());
        Files.createDirectories(file.getParent());
        Path temp = file.resolveSibling(file.getFileName() + ".tmp");
        Files.writeString(temp, gson.toJson(ids));
        Files.move(temp, file, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
    }
}
