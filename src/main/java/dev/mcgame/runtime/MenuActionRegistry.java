package dev.mcgame.runtime;

import net.minecraft.nbt.CompoundTag;
import net.minecraft.nbt.Tag;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerPlayer;

import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

public final class MenuActionRegistry {
    static final Identifier ACTION_ID = Identifier.fromNamespaceAndPath("mc_game_runtime", "menu_action");

    private static final Map<String, Entry> ENTRIES = new ConcurrentHashMap<>();

    private MenuActionRegistry() {}

    static String register(ScriptInstance script, UUID playerId, String menuId, String actionId) {
        String token = UUID.randomUUID().toString().replace("-", "");
        ENTRIES.put(token, new Entry(script, playerId, menuId, actionId));
        return token;
    }

    static void removeForScript(ScriptInstance script) {
        ENTRIES.entrySet().removeIf(entry -> entry.getValue().script() == script);
    }

    static void removeForPlayerMenu(ScriptInstance script, UUID playerId, String menuId) {
        ENTRIES.entrySet().removeIf(entry -> {
            Entry value = entry.getValue();
            return value.script() == script && value.playerId().equals(playerId) && value.menuId().equals(menuId);
        });
    }

    public static boolean handle(ServerPlayer player, Identifier id, Optional<Tag> payload) {
        if (!ACTION_ID.equals(id)) return false;
        if (payload.isEmpty() || !(payload.get() instanceof CompoundTag compound)) return true;
        String token = compound.getStringOr("token", "");
        if (token.isEmpty()) return true;

        Entry entry = ENTRIES.remove(token);
        if (entry == null) return true;
        if (!entry.playerId().equals(player.getUUID())) return true;
        entry.script().enqueueMenuAction(player.getUUID(), player.getGameProfile().name(), entry.menuId(), entry.actionId());
        return true;
    }

    private record Entry(ScriptInstance script, UUID playerId, String menuId, String actionId) {}
}
