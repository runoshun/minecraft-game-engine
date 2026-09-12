package dev.mcgame.runtime;

import org.graalvm.polyglot.Value;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

final class PortableProgramParser {
    private static final Pattern VALUE_NAME = Pattern.compile("[A-Za-z][A-Za-z0-9_]{0,31}");
    private static final Pattern PROJECTION_ID = Pattern.compile("[a-z][a-z0-9_]{0,23}");
    private static final Pattern RESOURCE_ID = Pattern.compile("[a-z0-9_.-]+:[a-z0-9_./-]+");
    private static final int MAX_STATES = 128;
    private static final int MAX_INPUTS = 32;
    private static final int MAX_PROJECTIONS = 64;
    private static final int MAX_TEXTS = 64;
    private static final int MAX_CAMERAS = 1;
    private static final int MAX_PARTICLES = 64;
    private static final int MAX_SOUNDS = 64;
    private static final int MAX_HUDS = 1;
    private static final int MAX_HUD_TOKENS = 32;
    private static final int MAX_ACTIONS = 2048;
    private static final int MAX_DEPTH = 16;

    private PortableProgramParser() {}

    static PortableProgram parse(Value spec, String api) {
        if (spec == null || !spec.hasMembers()) throw new IllegalArgumentException(api + " requires an object");
        int version = memberInt(spec, "version", PortableProgram.VERSION_1);
        if (version < PortableProgram.VERSION_1 || version > PortableProgram.CURRENT_VERSION) {
            throw new IllegalArgumentException(api + " unsupported version " + version + "; supported versions are 1-" + PortableProgram.CURRENT_VERSION);
        }
        int fixedPoint = memberInt(spec, "fixedPoint", 1000);
        if (fixedPoint < 1 || fixedPoint > 1_000_000) {
            throw new IllegalArgumentException(api + ".fixedPoint must be between 1 and 1000000");
        }

        Value state = requiredObject(spec, "state", api);
        Set<String> stateNames = state.getMemberKeys();
        if (stateNames.isEmpty()) throw new IllegalArgumentException(api + ".state must define at least one value");
        if (stateNames.size() > MAX_STATES) throw new IllegalArgumentException(api + ".state exceeds max state count " + MAX_STATES);

        Map<String, Integer> initialState = new LinkedHashMap<>();
        for (String name : stateNames.stream().sorted().toList()) {
            validateValueName(name, api + ".state");
            Value value = state.getMember(name);
            if (value == null || !value.isNumber()) throw new IllegalArgumentException(api + ".state." + name + " must be a number");
            initialState.put(name, scale(value.asDouble(), fixedPoint, api + ".state." + name));
        }

        Map<String, Integer> initialInputs = new LinkedHashMap<>();
        if (spec.hasMember("inputs")) {
            if (version < PortableProgram.VERSION_2) throw new IllegalArgumentException(api + ".inputs requires portable version 2");
            Value inputs = requiredObject(spec, "inputs", api);
            Set<String> inputNames = inputs.getMemberKeys();
            if (inputNames.size() > MAX_INPUTS) throw new IllegalArgumentException(api + ".inputs exceeds max input count " + MAX_INPUTS);
            for (String name : inputNames.stream().sorted().toList()) {
                validateValueName(name, api + ".inputs");
                if (initialState.containsKey(name)) throw new IllegalArgumentException(api + ".inputs name collides with state: " + name);
                Value value = inputs.getMember(name);
                if (value == null || !value.isNumber()) throw new IllegalArgumentException(api + ".inputs." + name + " must be a number");
                initialInputs.put(name, scale(value.asDouble(), fixedPoint, api + ".inputs." + name));
            }
        }

        Map<String, PortableProgram.VanillaInputSource> vanillaInputs = new LinkedHashMap<>();
        List<PortableProgram.VanillaBlockProjection> vanillaProjections = new ArrayList<>();
        List<PortableProgram.VanillaTextProjection> vanillaTexts = new ArrayList<>();
        List<PortableProgram.VanillaCamera> vanillaCameras = new ArrayList<>();
        List<PortableProgram.VanillaParticleEmitter> vanillaParticles = new ArrayList<>();
        List<PortableProgram.VanillaSoundEmitter> vanillaSounds = new ArrayList<>();
        List<PortableProgram.VanillaHud> vanillaHuds = new ArrayList<>();

        if (spec.hasMember("vanilla")) {
            if (version < PortableProgram.VERSION_2) throw new IllegalArgumentException(api + ".vanilla requires portable version 2");
            Value vanilla = requiredObject(spec, "vanilla", api);

            if (vanilla.hasMember("inputs")) {
                Value bindings = requiredObject(vanilla, "inputs", api + ".vanilla");
                for (String inputName : bindings.getMemberKeys().stream().sorted().toList()) {
                    if (!initialInputs.containsKey(inputName)) {
                        throw new IllegalArgumentException(api + ".vanilla.inputs references unknown portable input " + inputName);
                    }
                    Value binding = bindings.getMember(inputName);
                    if (binding == null || !binding.hasMembers()) {
                        throw new IllegalArgumentException(api + ".vanilla.inputs." + inputName + " must be an object");
                    }
                    String path = api + ".vanilla.inputs." + inputName;
                    String source = requiredString(binding, "source", path);
                    PortableProgram.VanillaInputSource parsedSource = switch (source) {
                        case "first_player_hotbar_slot" -> PortableProgram.VanillaInputSource.FIRST_PLAYER_HOTBAR_SLOT;
                        case "first_player_forward" -> requireV3Input(version, PortableProgram.VanillaInputSource.FIRST_PLAYER_FORWARD, path);
                        case "first_player_backward" -> requireV3Input(version, PortableProgram.VanillaInputSource.FIRST_PLAYER_BACKWARD, path);
                        case "first_player_left" -> requireV3Input(version, PortableProgram.VanillaInputSource.FIRST_PLAYER_LEFT, path);
                        case "first_player_right" -> requireV3Input(version, PortableProgram.VanillaInputSource.FIRST_PLAYER_RIGHT, path);
                        case "first_player_jump" -> requireV3Input(version, PortableProgram.VanillaInputSource.FIRST_PLAYER_JUMP, path);
                        case "first_player_sneak" -> requireV3Input(version, PortableProgram.VanillaInputSource.FIRST_PLAYER_SNEAK, path);
                        case "first_player_sprint" -> requireV3Input(version, PortableProgram.VanillaInputSource.FIRST_PLAYER_SPRINT, path);
                        default -> throw new IllegalArgumentException(path + ".source unsupported source: " + source);
                    };
                    vanillaInputs.put(inputName, parsedSource);
                }
            }

            if (vanilla.hasMember("projections")) {
                Value projections = requiredArray(vanilla, "projections", api + ".vanilla");
                if (projections.getArraySize() > MAX_PROJECTIONS) {
                    throw new IllegalArgumentException(api + ".vanilla.projections exceeds max projection count " + MAX_PROJECTIONS);
                }
                Set<String> projectionIds = new java.util.HashSet<>();
                for (long i = 0; i < projections.getArraySize(); i++) {
                    Value projection = projections.getArrayElement(i);
                    String path = api + ".vanilla.projections[" + i + "]";
                    if (projection == null || !projection.hasMembers()) throw new IllegalArgumentException(path + " must be an object");
                    String id = requiredPortableId(projection, path);
                    if (!projectionIds.add(id)) throw new IllegalArgumentException(path + ".id is duplicated: " + id);
                    String dimension = memberResource(projection, "dimension", "minecraft:overworld", path);
                    String block = memberResource(projection, "block", null, path);
                    PortableProgram.VanillaCoordinate x = parseVanillaCoordinate(requiredMember(projection, "x", path), initialState.keySet(), fixedPoint, path + ".x");
                    PortableProgram.VanillaCoordinate y = parseVanillaCoordinate(requiredMember(projection, "y", path), initialState.keySet(), fixedPoint, path + ".y");
                    PortableProgram.VanillaCoordinate z = parseVanillaCoordinate(requiredMember(projection, "z", path), initialState.keySet(), fixedPoint, path + ".z");
                    PortableProgram.VanillaVec3 scale = memberVanillaVec3(projection, "scale", new PortableProgram.VanillaVec3(1, 1, 1), path, true);
                    PortableProgram.VanillaVec3 translation = memberVanillaVec3(projection, "translation", new PortableProgram.VanillaVec3(0, 0, 0), path, false);
                    vanillaProjections.add(new PortableProgram.VanillaBlockProjection(id, dimension, block, x, y, z, scale, translation));
                }
            }

            if (vanilla.hasMember("texts")) {
                if (version < PortableProgram.VERSION_4) throw new IllegalArgumentException(api + ".vanilla.texts requires portable version 4");
                Value texts = requiredArray(vanilla, "texts", api + ".vanilla");
                if (texts.getArraySize() > MAX_TEXTS) throw new IllegalArgumentException(api + ".vanilla.texts exceeds max text count " + MAX_TEXTS);
                Set<String> textIds = new java.util.HashSet<>();
                for (long i = 0; i < texts.getArraySize(); i++) {
                    Value text = texts.getArrayElement(i);
                    String path = api + ".vanilla.texts[" + i + "]";
                    if (text == null || !text.hasMembers()) throw new IllegalArgumentException(path + " must be an object");
                    String id = requiredPortableId(text, path);
                    if (!textIds.add(id)) throw new IllegalArgumentException(path + ".id is duplicated: " + id);
                    String dimension = memberResource(text, "dimension", "minecraft:overworld", path);
                    String content = requiredString(text, "text", path);
                    if (content.length() > 256) throw new IllegalArgumentException(path + ".text exceeds 256 characters");
                    PortableProgram.VanillaCoordinate x = parseVanillaCoordinate(requiredMember(text, "x", path), initialState.keySet(), fixedPoint, path + ".x");
                    PortableProgram.VanillaCoordinate y = parseVanillaCoordinate(requiredMember(text, "y", path), initialState.keySet(), fixedPoint, path + ".y");
                    PortableProgram.VanillaCoordinate z = parseVanillaCoordinate(requiredMember(text, "z", path), initialState.keySet(), fixedPoint, path + ".z");
                    PortableProgram.VanillaVec3 scale = memberVanillaVec3(text, "scale", new PortableProgram.VanillaVec3(1, 1, 1), path, true);
                    String billboard = memberString(text, "billboard", "center", path);
                    if (!Set.of("fixed", "vertical", "horizontal", "center").contains(billboard)) {
                        throw new IllegalArgumentException(path + ".billboard must be fixed, vertical, horizontal, or center");
                    }
                    vanillaTexts.add(new PortableProgram.VanillaTextProjection(id, dimension, content, x, y, z, scale, billboard));
                }
            }

            if (vanilla.hasMember("cameras")) {
                if (version < PortableProgram.VERSION_3) throw new IllegalArgumentException(api + ".vanilla.cameras requires portable version 3");
                Value cameras = requiredArray(vanilla, "cameras", api + ".vanilla");
                if (cameras.getArraySize() > MAX_CAMERAS) throw new IllegalArgumentException(api + ".vanilla.cameras exceeds max camera count " + MAX_CAMERAS);
                Set<String> cameraIds = new java.util.HashSet<>();
                for (long i = 0; i < cameras.getArraySize(); i++) {
                    Value camera = cameras.getArrayElement(i);
                    String path = api + ".vanilla.cameras[" + i + "]";
                    if (camera == null || !camera.hasMembers()) throw new IllegalArgumentException(path + " must be an object");
                    String id = requiredPortableId(camera, path);
                    if (!cameraIds.add(id)) throw new IllegalArgumentException(path + ".id is duplicated: " + id);
                    String dimension = memberResource(camera, "dimension", "minecraft:overworld", path);
                    PortableProgram.VanillaCoordinate x = parseVanillaCoordinate(requiredMember(camera, "x", path), initialState.keySet(), fixedPoint, path + ".x");
                    PortableProgram.VanillaCoordinate y = parseVanillaCoordinate(requiredMember(camera, "y", path), initialState.keySet(), fixedPoint, path + ".y");
                    PortableProgram.VanillaCoordinate z = parseVanillaCoordinate(requiredMember(camera, "z", path), initialState.keySet(), fixedPoint, path + ".z");
                    double yaw = memberNumber(camera, "yaw", 0, path);
                    double pitch = memberNumber(camera, "pitch", 0, path);
                    if (pitch < -90 || pitch > 90) throw new IllegalArgumentException(path + ".pitch must be between -90 and 90");
                    vanillaCameras.add(new PortableProgram.VanillaCamera(id, dimension, x, y, z, yaw, pitch));
                }
            }

            if (vanilla.hasMember("particles")) {
                if (version < PortableProgram.VERSION_3) throw new IllegalArgumentException(api + ".vanilla.particles requires portable version 3");
                Value particles = requiredArray(vanilla, "particles", api + ".vanilla");
                if (particles.getArraySize() > MAX_PARTICLES) throw new IllegalArgumentException(api + ".vanilla.particles exceeds max particle count " + MAX_PARTICLES);
                Set<String> particleIds = new java.util.HashSet<>();
                for (long i = 0; i < particles.getArraySize(); i++) {
                    Value particle = particles.getArrayElement(i);
                    String path = api + ".vanilla.particles[" + i + "]";
                    if (particle == null || !particle.hasMembers()) throw new IllegalArgumentException(path + " must be an object");
                    String id = requiredPortableId(particle, path);
                    if (!particleIds.add(id)) throw new IllegalArgumentException(path + ".id is duplicated: " + id);
                    String dimension = memberResource(particle, "dimension", "minecraft:overworld", path);
                    String particleId = memberResource(particle, "particle", null, path);
                    PortableProgram.VanillaCoordinate x = parseVanillaCoordinate(requiredMember(particle, "x", path), initialState.keySet(), fixedPoint, path + ".x");
                    PortableProgram.VanillaCoordinate y = parseVanillaCoordinate(requiredMember(particle, "y", path), initialState.keySet(), fixedPoint, path + ".y");
                    PortableProgram.VanillaCoordinate z = parseVanillaCoordinate(requiredMember(particle, "z", path), initialState.keySet(), fixedPoint, path + ".z");
                    PortableProgram.VanillaVec3 delta = memberVanillaVec3(particle, "delta", new PortableProgram.VanillaVec3(0, 0, 0), path, false);
                    if (delta.x() < 0 || delta.y() < 0 || delta.z() < 0) throw new IllegalArgumentException(path + ".delta components must be >= 0");
                    double speed = memberNumber(particle, "speed", 0, path);
                    if (speed < 0 || speed > 100) throw new IllegalArgumentException(path + ".speed must be between 0 and 100");
                    int count = memberBoundedInt(particle, "count", 1, 1, 1000, path);
                    boolean force = memberBoolean(particle, "force", false, path);
                    PortableProgram.Condition condition = null;
                    if (particle.hasMember("when")) {
                        Value when = requiredObject(particle, "when", path);
                        condition = parseCondition(when, initialState.keySet(), initialInputs.keySet(), fixedPoint, path + ".when");
                    }
                    vanillaParticles.add(new PortableProgram.VanillaParticleEmitter(id, dimension, particleId, x, y, z, delta, speed, count, force, condition));
                }
            }

            if (vanilla.hasMember("sounds")) {
                if (version < PortableProgram.VERSION_4) throw new IllegalArgumentException(api + ".vanilla.sounds requires portable version 4");
                Value sounds = requiredArray(vanilla, "sounds", api + ".vanilla");
                if (sounds.getArraySize() > MAX_SOUNDS) throw new IllegalArgumentException(api + ".vanilla.sounds exceeds max sound count " + MAX_SOUNDS);
                Set<String> soundIds = new java.util.HashSet<>();
                for (long i = 0; i < sounds.getArraySize(); i++) {
                    Value sound = sounds.getArrayElement(i);
                    String path = api + ".vanilla.sounds[" + i + "]";
                    if (sound == null || !sound.hasMembers()) throw new IllegalArgumentException(path + " must be an object");
                    String id = requiredPortableId(sound, path);
                    if (!soundIds.add(id)) throw new IllegalArgumentException(path + ".id is duplicated: " + id);
                    String dimension = memberResource(sound, "dimension", "minecraft:overworld", path);
                    String soundId = memberResource(sound, "sound", null, path);
                    PortableProgram.VanillaCoordinate x = parseVanillaCoordinate(requiredMember(sound, "x", path), initialState.keySet(), fixedPoint, path + ".x");
                    PortableProgram.VanillaCoordinate y = parseVanillaCoordinate(requiredMember(sound, "y", path), initialState.keySet(), fixedPoint, path + ".y");
                    PortableProgram.VanillaCoordinate z = parseVanillaCoordinate(requiredMember(sound, "z", path), initialState.keySet(), fixedPoint, path + ".z");
                    double volume = memberNumber(sound, "volume", 1, path);
                    double pitch = memberNumber(sound, "pitch", 1, path);
                    if (volume < 0 || volume > 100) throw new IllegalArgumentException(path + ".volume must be between 0 and 100");
                    if (pitch < 0 || pitch > 2) throw new IllegalArgumentException(path + ".pitch must be between 0 and 2");
                    PortableProgram.Condition condition = null;
                    if (sound.hasMember("when")) {
                        condition = parseCondition(requiredObject(sound, "when", path), initialState.keySet(), initialInputs.keySet(), fixedPoint, path + ".when");
                    }
                    vanillaSounds.add(new PortableProgram.VanillaSoundEmitter(id, dimension, soundId, x, y, z, volume, pitch, condition));
                }
            }

            if (vanilla.hasMember("huds")) {
                if (version < PortableProgram.VERSION_4) throw new IllegalArgumentException(api + ".vanilla.huds requires portable version 4");
                Value huds = requiredArray(vanilla, "huds", api + ".vanilla");
                if (huds.getArraySize() > MAX_HUDS) throw new IllegalArgumentException(api + ".vanilla.huds exceeds max HUD count " + MAX_HUDS);
                Set<String> hudIds = new java.util.HashSet<>();
                for (long i = 0; i < huds.getArraySize(); i++) {
                    Value hud = huds.getArrayElement(i);
                    String path = api + ".vanilla.huds[" + i + "]";
                    if (hud == null || !hud.hasMembers()) throw new IllegalArgumentException(path + " must be an object");
                    String id = requiredPortableId(hud, path);
                    if (!hudIds.add(id)) throw new IllegalArgumentException(path + ".id is duplicated: " + id);
                    Value tokens = requiredArray(hud, "tokens", path);
                    if (tokens.getArraySize() < 1 || tokens.getArraySize() > MAX_HUD_TOKENS) {
                        throw new IllegalArgumentException(path + ".tokens must contain 1.." + MAX_HUD_TOKENS + " entries");
                    }
                    List<PortableProgram.HudToken> parsed = new ArrayList<>();
                    for (long j = 0; j < tokens.getArraySize(); j++) {
                        Value token = tokens.getArrayElement(j);
                        String tokenPath = path + ".tokens[" + j + "]";
                        if (token == null || !token.hasMembers()) throw new IllegalArgumentException(tokenPath + " must be an object");
                        if (token.hasMember("text")) {
                            String literal = requiredString(token, "text", tokenPath);
                            if (literal.length() > 128) throw new IllegalArgumentException(tokenPath + ".text exceeds 128 characters");
                            parsed.add(new PortableProgram.HudLiteral(literal));
                        } else if (token.hasMember("value")) {
                            parsed.add(new PortableProgram.HudValue(parseValue(requiredMember(token, "value", tokenPath), initialState.keySet(), initialInputs.keySet(), fixedPoint, tokenPath + ".value")));
                        } else {
                            throw new IllegalArgumentException(tokenPath + " requires text or value");
                        }
                    }
                    vanillaHuds.add(new PortableProgram.VanillaHud(id, parsed));
                }
            }
        }

        Value tick = spec.hasMember("tick") ? spec.getMember("tick") : null;
        if (tick == null || !tick.hasArrayElements()) throw new IllegalArgumentException(api + ".tick must be an array");
        Counter counter = new Counter();
        List<PortableProgram.Action> actions = parseActions(tick, initialState.keySet(), initialInputs.keySet(), fixedPoint, version, 0, counter, api + ".tick");
        return new PortableProgram(
            version,
            fixedPoint,
            initialState,
            initialInputs,
            vanillaInputs,
            vanillaProjections,
            vanillaTexts,
            vanillaCameras,
            vanillaParticles,
            vanillaSounds,
            vanillaHuds,
            actions
        );
    }

    private static PortableProgram.VanillaInputSource requireV3Input(int version, PortableProgram.VanillaInputSource source, String path) {
        if (version < PortableProgram.VERSION_3) throw new IllegalArgumentException(path + ".source requires portable version 3");
        return source;
    }

    private static List<PortableProgram.Action> parseActions(
        Value array,
        Set<String> states,
        Set<String> inputs,
        int fixedPoint,
        int version,
        int depth,
        Counter counter,
        String path
    ) {
        if (depth > MAX_DEPTH) throw new IllegalArgumentException(path + " exceeds max nesting depth " + MAX_DEPTH);
        List<PortableProgram.Action> out = new ArrayList<>();
        long size = array.getArraySize();
        for (long i = 0; i < size; i++) {
            counter.count++;
            if (counter.count > MAX_ACTIONS) throw new IllegalArgumentException(path + " exceeds max action count " + MAX_ACTIONS);
            Value action = array.getArrayElement(i);
            if (action == null || !action.hasMembers()) throw new IllegalArgumentException(path + "[" + i + "] must be an object");
            String op = requiredString(action, "op", path + "[" + i + "]");
            String actionPath = path + "[" + i + "]";
            out.add(switch (op) {
                case "set" -> new PortableProgram.SetAction(
                    requiredStateTarget(action, states, actionPath),
                    parseValue(requiredMember(action, "value", actionPath), states, inputs, fixedPoint, actionPath + ".value")
                );
                case "add" -> new PortableProgram.AddAction(
                    requiredStateTarget(action, states, actionPath),
                    parseValue(requiredMember(action, "value", actionPath), states, inputs, fixedPoint, actionPath + ".value")
                );
                case "sub" -> new PortableProgram.SubAction(
                    requiredStateTarget(action, states, actionPath),
                    parseValue(requiredMember(action, "value", actionPath), states, inputs, fixedPoint, actionPath + ".value")
                );
                case "negate" -> new PortableProgram.NegateAction(requiredStateTarget(action, states, actionPath));
                case "if" -> {
                    Value conditionValue = requiredObject(action, "condition", actionPath);
                    PortableProgram.Condition condition = parseCondition(conditionValue, states, inputs, fixedPoint, actionPath + ".condition");
                    Value thenValue = requiredArray(action, "then", actionPath);
                    List<PortableProgram.Action> thenActions = parseActions(thenValue, states, inputs, fixedPoint, version, depth + 1, counter, actionPath + ".then");
                    List<PortableProgram.Action> elseActions = List.of();
                    if (action.hasMember("else")) {
                        Value elseValue = requiredArray(action, "else", actionPath);
                        elseActions = parseActions(elseValue, states, inputs, fixedPoint, version, depth + 1, counter, actionPath + ".else");
                    }
                    yield new PortableProgram.IfAction(condition, thenActions, elseActions);
                }
                case "if_aabb" -> {
                    if (version < PortableProgram.VERSION_4) throw new IllegalArgumentException(actionPath + ".op requires portable version 4");
                    PortableProgram.Aabb2d a = parseAabb(requiredObject(action, "a", actionPath), states, inputs, fixedPoint, actionPath + ".a");
                    PortableProgram.Aabb2d b = parseAabb(requiredObject(action, "b", actionPath), states, inputs, fixedPoint, actionPath + ".b");
                    List<PortableProgram.Action> thenActions = parseActions(requiredArray(action, "then", actionPath), states, inputs, fixedPoint, version, depth + 1, counter, actionPath + ".then");
                    List<PortableProgram.Action> elseActions = List.of();
                    if (action.hasMember("else")) {
                        elseActions = parseActions(requiredArray(action, "else", actionPath), states, inputs, fixedPoint, version, depth + 1, counter, actionPath + ".else");
                    }
                    yield new PortableProgram.AabbIfAction(a, b, thenActions, elseActions);
                }
                default -> throw new IllegalArgumentException(actionPath + ".op unsupported portable operation: " + op);
            });
        }
        return List.copyOf(out);
    }

    private static PortableProgram.Aabb2d parseAabb(Value value, Set<String> states, Set<String> inputs, int fixedPoint, String path) {
        PortableProgram.ValueRef x = parseValue(requiredMember(value, "x", path), states, inputs, fixedPoint, path + ".x");
        PortableProgram.ValueRef y = parseValue(requiredMember(value, "y", path), states, inputs, fixedPoint, path + ".y");
        double width = requiredNumber(value, "width", path);
        double height = requiredNumber(value, "height", path);
        if (width <= 0 || width > 1000) throw new IllegalArgumentException(path + ".width must be > 0 and <= 1000");
        if (height <= 0 || height > 1000) throw new IllegalArgumentException(path + ".height must be > 0 and <= 1000");
        int halfWidth = scale(width / 2.0, fixedPoint, path + ".width");
        int halfHeight = scale(height / 2.0, fixedPoint, path + ".height");
        if (halfWidth < 1 || halfHeight < 1) throw new IllegalArgumentException(path + " dimensions are below fixed-point resolution");
        return new PortableProgram.Aabb2d(x, y, halfWidth, halfHeight);
    }

    private static PortableProgram.Condition parseCondition(Value value, Set<String> states, Set<String> inputs, int fixedPoint, String path) {
        String op = requiredString(value, "op", path);
        PortableProgram.Comparison comparison = switch (op) {
            case "eq" -> PortableProgram.Comparison.EQ;
            case "ne" -> PortableProgram.Comparison.NE;
            case "lt" -> PortableProgram.Comparison.LT;
            case "lte" -> PortableProgram.Comparison.LTE;
            case "gt" -> PortableProgram.Comparison.GT;
            case "gte" -> PortableProgram.Comparison.GTE;
            default -> throw new IllegalArgumentException(path + ".op unsupported comparison: " + op);
        };
        return new PortableProgram.Condition(
            comparison,
            parseValue(requiredMember(value, "left", path), states, inputs, fixedPoint, path + ".left"),
            parseValue(requiredMember(value, "right", path), states, inputs, fixedPoint, path + ".right")
        );
    }

    private static PortableProgram.ValueRef parseValue(Value value, Set<String> states, Set<String> inputs, int fixedPoint, String path) {
        if (value.isNumber()) return new PortableProgram.ConstantValue(scale(value.asDouble(), fixedPoint, path));
        if (value.hasMembers() && value.hasMember("state")) {
            Value state = value.getMember("state");
            if (state == null || !state.isString()) throw new IllegalArgumentException(path + ".state must be a string");
            String name = state.asString();
            if (!states.contains(name)) throw new IllegalArgumentException(path + " references unknown state " + name);
            return new PortableProgram.StateValue(name);
        }
        if (value.hasMembers() && value.hasMember("input")) {
            Value input = value.getMember("input");
            if (input == null || !input.isString()) throw new IllegalArgumentException(path + ".input must be a string");
            String name = input.asString();
            if (!inputs.contains(name)) throw new IllegalArgumentException(path + " references unknown input " + name);
            return new PortableProgram.InputValue(name);
        }
        throw new IllegalArgumentException(path + " must be a number, { state: string }, or { input: string }");
    }

    private static PortableProgram.VanillaCoordinate parseVanillaCoordinate(Value value, Set<String> states, int fixedPoint, String path) {
        if (value.isNumber()) return new PortableProgram.VanillaCoordinate(null, scale(value.asDouble(), fixedPoint, path));
        if (!value.hasMembers()) throw new IllegalArgumentException(path + " must be a number or { state, base? }");
        String state = requiredString(value, "state", path);
        if (!states.contains(state)) throw new IllegalArgumentException(path + " references unknown state " + state);
        double base = memberNumber(value, "base", 0, path);
        return new PortableProgram.VanillaCoordinate(state, scale(base, fixedPoint, path + ".base"));
    }

    private static PortableProgram.VanillaVec3 memberVanillaVec3(Value object, String member, PortableProgram.VanillaVec3 fallback, String path, boolean positive) {
        if (!object.hasMember(member)) return fallback;
        Value value = object.getMember(member);
        double x;
        double y;
        double z;
        if (value != null && value.isNumber()) {
            x = y = z = finiteNumber(value.asDouble(), path + "." + member);
        } else {
            if (value == null || !value.hasMembers()) throw new IllegalArgumentException(path + "." + member + " must be a number or vec3");
            x = memberNumber(value, "x", fallback.x(), path + "." + member);
            y = memberNumber(value, "y", fallback.y(), path + "." + member);
            z = memberNumber(value, "z", fallback.z(), path + "." + member);
        }
        if (positive && (x <= 0 || y <= 0 || z <= 0 || x > 100 || y > 100 || z > 100)) {
            throw new IllegalArgumentException(path + "." + member + " components must be > 0 and <= 100");
        }
        if (!positive && (Math.abs(x) > 100 || Math.abs(y) > 100 || Math.abs(z) > 100)) {
            throw new IllegalArgumentException(path + "." + member + " components must be between -100 and 100");
        }
        return new PortableProgram.VanillaVec3(x, y, z);
    }

    private static String requiredPortableId(Value object, String path) {
        String id = requiredString(object, "id", path);
        if (!PROJECTION_ID.matcher(id).matches()) throw new IllegalArgumentException(path + ".id must match " + PROJECTION_ID.pattern());
        return id;
    }

    private static String memberString(Value object, String member, String fallback, String path) {
        if (!object.hasMember(member)) return fallback;
        Value value = object.getMember(member);
        if (value == null || !value.isString()) throw new IllegalArgumentException(path + "." + member + " must be a string");
        return value.asString();
    }

    private static double requiredNumber(Value object, String member, String path) {
        Value value = requiredMember(object, member, path);
        if (!value.isNumber()) throw new IllegalArgumentException(path + "." + member + " must be a number");
        return finiteNumber(value.asDouble(), path + "." + member);
    }

    private static double memberNumber(Value object, String member, double fallback, String path) {
        if (!object.hasMember(member)) return fallback;
        Value value = object.getMember(member);
        if (value == null || !value.isNumber()) throw new IllegalArgumentException(path + "." + member + " must be a number");
        return finiteNumber(value.asDouble(), path + "." + member);
    }

    private static double finiteNumber(double value, String path) {
        if (!Double.isFinite(value)) throw new IllegalArgumentException(path + " must be finite");
        return value;
    }

    private static boolean memberBoolean(Value object, String member, boolean fallback, String path) {
        if (!object.hasMember(member)) return fallback;
        Value value = object.getMember(member);
        if (value == null || !value.isBoolean()) throw new IllegalArgumentException(path + "." + member + " must be boolean");
        return value.asBoolean();
    }

    private static int memberBoundedInt(Value object, String member, int fallback, int min, int max, String path) {
        if (!object.hasMember(member)) return fallback;
        Value value = object.getMember(member);
        if (value == null || !value.fitsInInt()) throw new IllegalArgumentException(path + "." + member + " must be an integer");
        int result = value.asInt();
        if (result < min || result > max) throw new IllegalArgumentException(path + "." + member + " must be between " + min + " and " + max);
        return result;
    }

    private static String memberResource(Value object, String member, String fallback, String path) {
        String value = fallback;
        if (object.hasMember(member)) {
            Value memberValue = object.getMember(member);
            if (memberValue == null || !memberValue.isString()) throw new IllegalArgumentException(path + "." + member + " must be a string");
            value = memberValue.asString();
        }
        if (value == null) throw new IllegalArgumentException(path + "." + member + " is required");
        if (!RESOURCE_ID.matcher(value).matches()) throw new IllegalArgumentException(path + "." + member + " is not a valid resource id: " + value);
        return value;
    }

    private static int scale(double logical, int fixedPoint, String path) {
        if (!Double.isFinite(logical)) throw new IllegalArgumentException(path + " must be finite");
        double raw = logical * fixedPoint;
        if (raw < Integer.MIN_VALUE || raw > Integer.MAX_VALUE) throw new IllegalArgumentException(path + " exceeds signed 32-bit fixed-point range");
        return (int) Math.round(raw);
    }

    private static String requiredStateTarget(Value action, Set<String> states, String path) {
        String target = requiredString(action, "target", path);
        if (!states.contains(target)) throw new IllegalArgumentException(path + " references unknown target state " + target);
        return target;
    }

    private static void validateValueName(String name, String path) {
        if (!VALUE_NAME.matcher(name).matches()) throw new IllegalArgumentException(path + " name must match " + VALUE_NAME.pattern() + ": " + name);
    }

    private static int memberInt(Value object, String member, int fallback) {
        if (!object.hasMember(member)) return fallback;
        Value value = object.getMember(member);
        if (value == null || !value.fitsInInt()) throw new IllegalArgumentException(member + " must be an integer");
        return value.asInt();
    }

    private static Value requiredMember(Value object, String member, String path) {
        if (!object.hasMember(member)) throw new IllegalArgumentException(path + "." + member + " is required");
        Value value = object.getMember(member);
        if (value == null || value.isNull()) throw new IllegalArgumentException(path + "." + member + " is required");
        return value;
    }

    private static Value requiredObject(Value object, String member, String path) {
        Value value = requiredMember(object, member, path);
        if (!value.hasMembers()) throw new IllegalArgumentException(path + "." + member + " must be an object");
        return value;
    }

    private static Value requiredArray(Value object, String member, String path) {
        Value value = requiredMember(object, member, path);
        if (!value.hasArrayElements()) throw new IllegalArgumentException(path + "." + member + " must be an array");
        return value;
    }

    private static String requiredString(Value object, String member, String path) {
        Value value = requiredMember(object, member, path);
        if (!value.isString()) throw new IllegalArgumentException(path + "." + member + " must be a string");
        return value.asString();
    }

    private static final class Counter { int count; }
}
