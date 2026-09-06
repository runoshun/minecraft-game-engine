package dev.mcgame.runtime;

import net.fabricmc.api.ModInitializer;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerLifecycleEvents;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerTickEvents;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public final class McGameRuntimeMod implements ModInitializer {
    public static final String MOD_ID = "mc_game_runtime";
    public static final Logger LOGGER = LoggerFactory.getLogger(MOD_ID);

    private final ScriptManager scripts = new ScriptManager(LOGGER);
    private long tick;

    @Override
    public void onInitialize() {
        ServerLifecycleEvents.SERVER_STARTED.register(server -> scripts.reload(server, server.getResourceManager()));
        ServerLifecycleEvents.END_DATA_PACK_RELOAD.register((server, manager, success) -> {
            if (success) scripts.reload(server, manager);
            else LOGGER.warn("Datapack reload failed; keeping the previous mcgame scripts");
        });
        ServerLifecycleEvents.SERVER_STOPPING.register(scripts::close);
        ServerTickEvents.END_SERVER_TICK.register(server -> scripts.tick(server, ++tick));
        LOGGER.info("MC Game Runtime initialized");
    }
}
