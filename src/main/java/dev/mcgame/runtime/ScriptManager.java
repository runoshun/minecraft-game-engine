package dev.mcgame.runtime;

import net.minecraft.resources.Identifier;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.packs.resources.Resource;
import net.minecraft.server.packs.resources.ResourceManager;
import org.slf4j.Logger;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;

final class ScriptManager {
    private final Logger logger;
    private final List<ScriptInstance> scripts = new ArrayList<>();
    private TsCompiler compiler;

    ScriptManager(Logger logger) {
        this.logger = logger;
    }

    synchronized void reload(MinecraftServer server, ResourceManager resources) {
        final TsCompiler nextCompiler;
        try {
            nextCompiler = compiler != null ? compiler : new TsCompiler(logger);
        } catch (RuntimeException e) {
            logger.error("Could not initialize embedded TypeScript compiler", e);
            return;
        }

        Map<Identifier, Resource> found = resources.listResources(
            "mcgame",
            id -> id.getPath().equals("mcgame/main.ts") || id.getPath().endsWith("/mcgame/main.ts")
        );

        List<Map.Entry<Identifier, Resource>> entries = found.entrySet().stream()
            .sorted(Comparator.comparing(e -> e.getKey().toString()))
            .toList();

        List<ScriptInstance> next = new ArrayList<>();
        for (Map.Entry<Identifier, Resource> entry : entries) {
            Identifier id = entry.getKey();
            try (var in = entry.getValue().open()) {
                byte[] bytes = in.readNBytes(1_000_001);
                if (bytes.length > 1_000_000) throw new IllegalArgumentException("main.ts exceeds 1 MB PoC limit");
                String ts = new String(bytes, StandardCharsets.UTF_8);
                String js = nextCompiler.transpile(id.toString(), ts);
                ScriptInstance instance = new ScriptInstance(id, js, logger);
                next.add(instance);
                logger.info("Loaded mcgame script {} from pack {}", id, entry.getValue().sourcePackId());
            } catch (IOException | RuntimeException e) {
                logger.error("Failed to load mcgame script {}: {}", id, e.getMessage(), e);
            }
        }

        for (ScriptInstance old : scripts) old.close(server);
        scripts.clear();
        scripts.addAll(next);
        for (ScriptInstance script : scripts) {
            try { script.start(server); }
            catch (RuntimeException e) {
                logger.error("Disabling mcgame script {} after start failure: {}", script.id(), e.getMessage(), e);
                script.disable(server);
            }
        }
        scripts.removeIf(ScriptInstance::disabled);
        compiler = nextCompiler;
        logger.info("MC Game Runtime active scripts: {}", scripts.size());
    }

    synchronized void tick(MinecraftServer server, long tick) {
        for (ScriptInstance script : List.copyOf(scripts)) {
            try {
                script.tick(server, tick);
            } catch (RuntimeException e) {
                logger.error("Disabling mcgame script {} after tick failure: {}", script.id(), e.getMessage(), e);
                script.disable(server);
            }
        }
        scripts.removeIf(ScriptInstance::disabled);
    }

    synchronized void close(MinecraftServer server) {
        for (ScriptInstance script : scripts) script.close(server);
        scripts.clear();
        if (compiler != null) {
            compiler.close();
            compiler = null;
        }
    }
}
