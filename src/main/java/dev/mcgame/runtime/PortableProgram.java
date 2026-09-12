package dev.mcgame.runtime;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

final class PortableProgram {
    static final int VERSION_1 = 1;
    static final int VERSION_2 = 2;
    static final int VERSION_3 = 3;
    static final int VERSION_4 = 4;
    static final int CURRENT_VERSION = VERSION_4;

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

    record VanillaTextProjection(
        String id,
        String dimension,
        String text,
        VanillaCoordinate x,
        VanillaCoordinate y,
        VanillaCoordinate z,
        VanillaVec3 scale,
        String billboard
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

    record Condition(Comparison comparison, ValueRef left, ValueRef right) {}

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

    record VanillaSoundEmitter(
        String id,
        String dimension,
        String sound,
        VanillaCoordinate x,
        VanillaCoordinate y,
        VanillaCoordinate z,
        double volume,
        double pitch,
        Condition condition
    ) {}

    sealed interface HudToken permits HudLiteral, HudValue {}
    record HudLiteral(String text) implements HudToken {}
    record HudValue(ValueRef value) implements HudToken {}
    record VanillaHud(String id, List<HudToken> tokens) {
        VanillaHud { tokens = List.copyOf(tokens); }
    }

    record Aabb2d(ValueRef x, ValueRef y, int halfWidthRaw, int halfHeightRaw) {}

    sealed interface Action permits SetAction, AddAction, SubAction, NegateAction, IfAction, AabbIfAction {}
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
    record AabbIfAction(Aabb2d a, Aabb2d b, List<Action> thenActions, List<Action> elseActions) implements Action {
        AabbIfAction {
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
    private final List<VanillaTextProjection> vanillaTexts;
    private final List<VanillaCamera> vanillaCameras;
    private final List<VanillaParticleEmitter> vanillaParticles;
    private final List<VanillaSoundEmitter> vanillaSounds;
    private final List<VanillaHud> vanillaHuds;
    private final List<Action> tickActions;

    PortableProgram(
        int version,
        int fixedPoint,
        Map<String, Integer> initialState,
        Map<String, Integer> initialInputs,
        Map<String, VanillaInputSource> vanillaInputs,
        List<VanillaBlockProjection> vanillaProjections,
        List<VanillaTextProjection> vanillaTexts,
        List<VanillaCamera> vanillaCameras,
        List<VanillaParticleEmitter> vanillaParticles,
        List<VanillaSoundEmitter> vanillaSounds,
        List<VanillaHud> vanillaHuds,
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
        this.vanillaTexts = List.copyOf(vanillaTexts);
        this.vanillaCameras = List.copyOf(vanillaCameras);
        this.vanillaParticles = List.copyOf(vanillaParticles);
        this.vanillaSounds = List.copyOf(vanillaSounds);
        this.vanillaHuds = List.copyOf(vanillaHuds);
        this.tickActions = List.copyOf(tickActions);
    }

    int version() { return version; }
    int fixedPoint() { return fixedPoint; }
    Map<String, Integer> initialState() { return initialState; }
    Map<String, Integer> initialInputs() { return initialInputs; }
    Map<String, VanillaInputSource> vanillaInputs() { return vanillaInputs; }
    List<VanillaBlockProjection> vanillaProjections() { return vanillaProjections; }
    List<VanillaTextProjection> vanillaTexts() { return vanillaTexts; }
    List<VanillaCamera> vanillaCameras() { return vanillaCameras; }
    List<VanillaParticleEmitter> vanillaParticles() { return vanillaParticles; }
    List<VanillaSoundEmitter> vanillaSounds() { return vanillaSounds; }
    List<VanillaHud> vanillaHuds() { return vanillaHuds; }
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
