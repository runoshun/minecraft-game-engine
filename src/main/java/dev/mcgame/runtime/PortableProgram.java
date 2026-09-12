package dev.mcgame.runtime;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

final class PortableProgram {
    static final int VERSION_1 = 1;
    static final int VERSION_2 = 2;
    static final int VERSION_3 = 3;
    static final int CURRENT_VERSION = VERSION_3;

    sealed interface ValueRef permits StateValue, InputValue, ConstantValue {}
    record StateValue(String name) implements ValueRef {}
    record InputValue(String name) implements ValueRef {}
    record ConstantValue(int raw) implements ValueRef {}

    enum Comparison {
        EQ, NE, LT, LTE, GT, GTE
    }

    enum VanillaInputSource {
        FIRST_PLAYER_HOTBAR_SLOT,
        FIRST_PLAYER_FORWARD,
        FIRST_PLAYER_BACKWARD,
        FIRST_PLAYER_LEFT,
        FIRST_PLAYER_RIGHT,
        FIRST_PLAYER_JUMP,
        FIRST_PLAYER_SNEAK,
        FIRST_PLAYER_SPRINT;

        boolean heldInput() {
            return this != FIRST_PLAYER_HOTBAR_SLOT;
        }
    }

    record VanillaCoordinate(String state, int baseRaw) {
        boolean dynamic() { return state != null; }
    }

    record VanillaVec3(double x, double y, double z) {}

    record VanillaBlockProjection(
        String id,
        String dimension,
        String block,
        VanillaCoordinate x,
        VanillaCoordinate y,
        VanillaCoordinate z,
        VanillaVec3 scale,
        VanillaVec3 translation
    ) {}

    record VanillaCamera(
        String id,
        String dimension,
        VanillaCoordinate x,
        VanillaCoordinate y,
        VanillaCoordinate z,
        double yaw,
        double pitch
    ) {}

    record VanillaParticleEmitter(
        String id,
        String dimension,
        String particle,
        VanillaCoordinate x,
        VanillaCoordinate y,
        VanillaCoordinate z,
        VanillaVec3 delta,
        double speed,
        int count,
        boolean force,
        Condition condition
    ) {}

    record Condition(Comparison comparison, ValueRef left, ValueRef right) {}

    sealed interface Action permits SetAction, AddAction, SubAction, NegateAction, IfAction {}
    record SetAction(String target, ValueRef value) implements Action {}
    record AddAction(String target, ValueRef value) implements Action {}
    record SubAction(String target, ValueRef value) implements Action {}
    record NegateAction(String target) implements Action {}
    record IfAction(Condition condition, List<Action> thenActions, List<Action> elseActions) implements Action {
        IfAction {
            thenActions = List.copyOf(thenActions);
            elseActions = List.copyOf(elseActions);
        }
    }

    private final int version;
    private final int fixedPoint;
    private final Map<String, Integer> initialState;
    private final Map<String, Integer> initialInputs;
    private final Map<String, VanillaInputSource> vanillaInputs;
    private final List<VanillaBlockProjection> vanillaProjections;
    private final List<VanillaCamera> vanillaCameras;
    private final List<VanillaParticleEmitter> vanillaParticles;
    private final List<Action> tickActions;

    PortableProgram(
        int version,
        int fixedPoint,
        Map<String, Integer> initialState,
        Map<String, Integer> initialInputs,
        Map<String, VanillaInputSource> vanillaInputs,
        List<VanillaBlockProjection> vanillaProjections,
        List<VanillaCamera> vanillaCameras,
        List<VanillaParticleEmitter> vanillaParticles,
        List<Action> tickActions
    ) {
        if (version < VERSION_1 || version > CURRENT_VERSION) {
            throw new IllegalArgumentException("unsupported portable version: " + version);
        }
        if (fixedPoint < 1 || fixedPoint > 1_000_000) {
            throw new IllegalArgumentException("portable fixedPoint must be between 1 and 1000000");
        }
        this.version = version;
        this.fixedPoint = fixedPoint;
        this.initialState = Collections.unmodifiableMap(new LinkedHashMap<>(initialState));
        this.initialInputs = Collections.unmodifiableMap(new LinkedHashMap<>(initialInputs));
        this.vanillaInputs = Collections.unmodifiableMap(new LinkedHashMap<>(vanillaInputs));
        this.vanillaProjections = List.copyOf(vanillaProjections);
        this.vanillaCameras = List.copyOf(vanillaCameras);
        this.vanillaParticles = List.copyOf(vanillaParticles);
        this.tickActions = List.copyOf(tickActions);
    }

    int version() { return version; }
    int fixedPoint() { return fixedPoint; }
    Map<String, Integer> initialState() { return initialState; }
    Map<String, Integer> initialInputs() { return initialInputs; }
    Map<String, VanillaInputSource> vanillaInputs() { return vanillaInputs; }
    List<VanillaBlockProjection> vanillaProjections() { return vanillaProjections; }
    List<VanillaCamera> vanillaCameras() { return vanillaCameras; }
    List<VanillaParticleEmitter> vanillaParticles() { return vanillaParticles; }
    List<Action> tickActions() { return tickActions; }

    double logicalValue(int raw) {
        return ((double) raw) / fixedPoint;
    }

    int scale(double logical) {
        if (!Double.isFinite(logical)) throw new IllegalArgumentException("portable numeric values must be finite");
        double scaled = logical * fixedPoint;
        if (scaled < Integer.MIN_VALUE || scaled > Integer.MAX_VALUE) {
            throw new IllegalArgumentException("portable value exceeds signed 32-bit fixed-point range: " + logical);
        }
        return (int) Math.round(scaled);
    }
}
