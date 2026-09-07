package dev.mcgame.runtime;

import net.minecraft.server.level.ServerPlayer;

import java.util.Collections;
import java.util.EnumMap;
import java.util.HashMap;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/** Server-observable vanilla client actions, captured without a client mod. */
public final class InputActionRegistry {
    public enum Action {
        ATTACK("attack"),
        SWING("swing"),
        USE("use"),
        SWAP_OFFHAND("swap_offhand"),
        DROP("drop"),
        DROP_STACK("drop_stack"),
        USE_RELEASE("use_release"),
        DESTROY_START("destroy_start"),
        DESTROY_ABORT("destroy_abort"),
        DESTROY_STOP("destroy_stop"),
        STAB("stab"),
        PICK("pick"),
        VEHICLE_INVENTORY("vehicle_inventory"),
        RIDING_JUMP_START("riding_jump_start"),
        RIDING_JUMP_STOP("riding_jump_stop"),
        FALL_FLYING_START("fall_flying_start");

        private final String scriptName;

        Action(String scriptName) {
            this.scriptName = scriptName;
        }

        public String scriptName() {
            return scriptName;
        }
    }

    private static final Map<UUID, EnumMap<Action, Long>> COUNTERS = new HashMap<>();

    private InputActionRegistry() {}

    public static synchronized void record(ServerPlayer player, Action action) {
        EnumMap<Action, Long> counters = COUNTERS.computeIfAbsent(player.getUUID(), ignored -> new EnumMap<>(Action.class));
        counters.merge(action, 1L, Long::sum);
    }

    public static synchronized Map<Action, Long> snapshot(UUID playerId) {
        EnumMap<Action, Long> counters = COUNTERS.get(playerId);
        if (counters == null || counters.isEmpty()) return Map.of();
        return Collections.unmodifiableMap(new EnumMap<>(counters));
    }

    public static synchronized void retainPlayers(Set<UUID> playerIds) {
        COUNTERS.keySet().retainAll(playerIds);
    }
}
