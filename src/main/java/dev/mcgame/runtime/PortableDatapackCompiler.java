package dev.mcgame.runtime;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

final class PortableDatapackCompiler {
    private static final Pattern NAMESPACE = Pattern.compile("[a-z0-9_.-]+");
    private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();

    record Result(
        String namespace,
        String objective,
        int stateCount,
        int inputCount,
        int projectionCount,
        int cameraCount,
        int particleCount,
        int branchFunctionCount
    ) {}

    Result compile(PortableProgram program, String namespace, Path outputRoot) throws IOException {
        if (!NAMESPACE.matcher(namespace).matches()) {
            throw new IllegalArgumentException("portable namespace must match " + NAMESPACE.pattern());
        }
        String objective = objectiveName(namespace);
        CompileContext context = new CompileContext(namespace, objective);
        List<String> tick = new ArrayList<>();

        compileVanillaCameraAttach(program, tick, context);
        compileVanillaInputs(program, tick, context);
        compileActions(program.tickActions(), tick, context);
        compileVanillaProjections(program, tick, context);
        compileVanillaCameraUpdates(program, tick, context);
        compileVanillaParticles(program, tick, context);
        if (tick.isEmpty()) tick.add("# no portable tick actions");

        List<String> load = new ArrayList<>();
        load.add("scoreboard objectives add " + objective + " dummy");
        if (!program.vanillaCameras().isEmpty()) load.add("scoreboard players set #enabled " + objective + " 1");
        for (Map.Entry<String, Integer> entry : program.initialState().entrySet()) {
            load.add("scoreboard players set " + stateHolder(entry.getKey()) + " " + objective + " " + entry.getValue());
        }
        for (Map.Entry<String, Integer> entry : program.initialInputs().entrySet()) {
            load.add("scoreboard players set " + inputHolder(entry.getKey()) + " " + objective + " " + entry.getValue());
        }
        if (context.usesNegate) load.add("scoreboard players set #neg1 " + objective + " -1");
        for (Map.Entry<Integer, String> entry : context.constantHolders.entrySet()) {
            load.add("scoreboard players set " + entry.getValue() + " " + objective + " " + entry.getKey());
        }
        compileVanillaProjectionLoad(program, load, context);
        compileVanillaCameraLoad(program, load, context);
        compileVanillaParticleLoad(program, load, context);

        JsonObject pack = new JsonObject();
        JsonObject packBody = new JsonObject();
        packBody.addProperty("description", "Generated MC Game Runtime portable program: " + namespace);
        JsonArray format = new JsonArray();
        format.add(101); format.add(1);
        packBody.add("min_format", format.deepCopy());
        packBody.add("max_format", format.deepCopy());
        pack.add("pack", packBody);

        write(outputRoot.resolve("pack.mcmeta"), GSON.toJson(pack) + "\n");
        writeFunctionTag(outputRoot, "load", namespace + ":portable/load");
        writeFunctionTag(outputRoot, "tick", namespace + ":portable/tick");
        writeInputPredicates(program, outputRoot, namespace);

        Path functionRoot = outputRoot.resolve("data").resolve(namespace).resolve("function").resolve("portable");
        write(functionRoot.resolve("load.mcfunction"), String.join("\n", load) + "\n");
        write(functionRoot.resolve("tick.mcfunction"), String.join("\n", tick) + "\n");
        write(functionRoot.resolve("cleanup.mcfunction"), String.join("\n", cleanupLines(program, context)) + "\n");
        for (Map.Entry<String, List<String>> entry : context.functions.entrySet()) {
            write(functionRoot.resolve(entry.getKey() + ".mcfunction"), String.join("\n", entry.getValue()) + "\n");
        }

        StringBuilder marker = new StringBuilder();
        marker.append("namespace=").append(namespace).append('\n');
        marker.append("objective=").append(objective).append('\n');
        marker.append("portable_version=").append(program.version()).append('\n');
        marker.append("fixed_point=").append(program.fixedPoint()).append('\n');
        for (String input : program.initialInputs().keySet()) {
            marker.append("input.").append(input).append('=').append(inputHolder(input)).append('\n');
        }
        write(outputRoot.resolve(".mcgame-portable-generated"), marker.toString());
        return new Result(
            namespace,
            objective,
            program.initialState().size(),
            program.initialInputs().size(),
            program.vanillaProjections().size(),
            program.vanillaCameras().size(),
            program.vanillaParticles().size(),
            context.nextBranch
        );
    }

    private void writeInputPredicates(PortableProgram program, Path outputRoot, String namespace) throws IOException {
        Set<String> fields = new LinkedHashSet<>();
        for (PortableProgram.VanillaInputSource source : program.vanillaInputs().values()) {
            String field = inputField(source);
            if (field != null) fields.add(field);
        }
        for (String field : fields) {
            JsonObject root = new JsonObject();
            root.addProperty("condition", "minecraft:entity_properties");
            root.addProperty("entity", "this");
            JsonObject predicate = new JsonObject();
            JsonObject typeSpecific = new JsonObject();
            typeSpecific.addProperty("type", "minecraft:player");
            JsonObject input = new JsonObject();
            input.addProperty(field, true);
            typeSpecific.add("input", input);
            predicate.add("type_specific", typeSpecific);
            root.add("predicate", predicate);
            write(
                outputRoot.resolve("data").resolve(namespace).resolve("predicate").resolve("portable").resolve("input").resolve(field + ".json"),
                GSON.toJson(root) + "\n"
            );
        }
    }

    private void compileVanillaCameraAttach(PortableProgram program, List<String> lines, CompileContext context) {
        if (program.vanillaCameras().isEmpty()) return;
        PortableProgram.VanillaCamera camera = program.vanillaCameras().getFirst();
        String userTag = cameraUserTag(context.namespace);
        String cameraTag = cameraTag(context.namespace, camera.id());
        List<String> attach = List.of(
            "tag @s add " + userTag,
            "gamemode spectator @s",
            "execute in " + camera.dimension() + " run spectate @e[type=minecraft:armor_stand,tag=" + cameraTag + ",limit=1] @s"
        );
        context.functions.put("camera_attach", attach);
        lines.add("execute if score #enabled " + context.objective + " matches 1 unless entity @a[tag=" + userTag
            + "] as @a[gamemode=!spectator,tag=!" + userTag + ",limit=1,sort=arbitrary] run function "
            + context.namespace + ":portable/camera_attach");
    }

    private void compileVanillaInputs(PortableProgram program, List<String> lines, CompileContext context) {
        String selector = controllerSelector(program, context);
        for (Map.Entry<String, PortableProgram.VanillaInputSource> entry : program.vanillaInputs().entrySet()) {
            String input = entry.getKey();
            PortableProgram.VanillaInputSource source = entry.getValue();
            String holder = inputHolder(input);
            if (source == PortableProgram.VanillaInputSource.FIRST_PLAYER_HOTBAR_SLOT) {
                int fallback = program.initialInputs().get(input);
                lines.add("scoreboard players set " + holder + " " + context.objective + " " + fallback);
                lines.add("execute as " + selector + " store result score " + holder + " " + context.objective
                    + " run data get entity @s SelectedItemSlot " + program.fixedPoint());
            } else {
                String field = inputField(source);
                lines.add("scoreboard players set " + holder + " " + context.objective + " 0");
                lines.add("execute as " + selector + " if predicate " + context.namespace + ":portable/input/" + field
                    + " run scoreboard players set " + holder + " " + context.objective + " " + program.fixedPoint());
            }
        }
    }

    private static String controllerSelector(PortableProgram program, CompileContext context) {
        if (!program.vanillaCameras().isEmpty()) return "@a[tag=" + cameraUserTag(context.namespace) + ",limit=1]";
        return "@a[gamemode=!spectator,limit=1,sort=arbitrary]";
    }

    private static String inputField(PortableProgram.VanillaInputSource source) {
        return switch (source) {
            case FIRST_PLAYER_HOTBAR_SLOT -> null;
            case FIRST_PLAYER_FORWARD -> "forward";
            case FIRST_PLAYER_BACKWARD -> "backward";
            case FIRST_PLAYER_LEFT -> "left";
            case FIRST_PLAYER_RIGHT -> "right";
            case FIRST_PLAYER_JUMP -> "jump";
            case FIRST_PLAYER_SNEAK -> "sneak";
            case FIRST_PLAYER_SPRINT -> "sprint";
        };
    }

    private void compileVanillaProjectionLoad(PortableProgram program, List<String> lines, CompileContext context) {
        for (PortableProgram.VanillaBlockProjection projection : program.vanillaProjections()) {
            String tag = projectionTag(context.namespace, projection.id());
            double x = logicalCoordinate(program, projection.x());
            double y = logicalCoordinate(program, projection.y());
            double z = logicalCoordinate(program, projection.z());
            int chunkBlockX = (int) Math.floor(x);
            int chunkBlockZ = (int) Math.floor(z);
            lines.add("execute in " + projection.dimension() + " run forceload add " + chunkBlockX + " " + chunkBlockZ);
            lines.add("execute in " + projection.dimension() + " run kill @e[tag=" + tag + "]");
            PortableProgram.VanillaVec3 scale = projection.scale();
            PortableProgram.VanillaVec3 translation = projection.translation();
            String snbt = "{Tags:[\"" + tag + "\"],block_state:{Name:\"" + projection.block() + "\"},transformation:{"
                + "translation:[" + floatLiteral(translation.x()) + "," + floatLiteral(translation.y()) + "," + floatLiteral(translation.z()) + "],"
                + "left_rotation:[0f,0f,0f,1f],"
                + "scale:[" + floatLiteral(scale.x()) + "," + floatLiteral(scale.y()) + "," + floatLiteral(scale.z()) + "],"
                + "right_rotation:[0f,0f,0f,1f]}}";
            lines.add(String.format(Locale.ROOT,
                "execute in %s run summon minecraft:block_display %.6f %.6f %.6f %s",
                projection.dimension(), x, y, z, snbt));
            lines.add("execute in " + projection.dimension() + " run forceload remove " + chunkBlockX + " " + chunkBlockZ);
        }
    }

    private void compileVanillaCameraLoad(PortableProgram program, List<String> lines, CompileContext context) {
        for (PortableProgram.VanillaCamera camera : program.vanillaCameras()) {
            String tag = cameraTag(context.namespace, camera.id());
            double x = logicalCoordinate(program, camera.x());
            double y = logicalCoordinate(program, camera.y());
            double z = logicalCoordinate(program, camera.z());
            int chunkBlockX = (int) Math.floor(x);
            int chunkBlockZ = (int) Math.floor(z);
            lines.add("execute in " + camera.dimension() + " run forceload add " + chunkBlockX + " " + chunkBlockZ);
            lines.add("execute in " + camera.dimension() + " run kill @e[tag=" + tag + "]");
            String snbt = String.format(Locale.ROOT,
                "{Tags:[\"%s\"],Invisible:1b,Invulnerable:1b,NoGravity:1b,Marker:1b,Rotation:[%.3ff,%.3ff]}",
                tag, camera.yaw(), camera.pitch());
            lines.add(String.format(Locale.ROOT,
                "execute in %s run summon minecraft:armor_stand %.6f %.6f %.6f %s",
                camera.dimension(), x, y, z, snbt));
            lines.add("execute in " + camera.dimension() + " run forceload remove " + chunkBlockX + " " + chunkBlockZ);
        }
    }

    private void compileVanillaParticleLoad(PortableProgram program, List<String> lines, CompileContext context) {
        for (PortableProgram.VanillaParticleEmitter emitter : program.vanillaParticles()) {
            if (!dynamic(emitter.x(), emitter.y(), emitter.z())) continue;
            String tag = particleTag(context.namespace, emitter.id());
            double x = logicalCoordinate(program, emitter.x());
            double y = logicalCoordinate(program, emitter.y());
            double z = logicalCoordinate(program, emitter.z());
            int chunkBlockX = (int) Math.floor(x);
            int chunkBlockZ = (int) Math.floor(z);
            lines.add("execute in " + emitter.dimension() + " run forceload add " + chunkBlockX + " " + chunkBlockZ);
            lines.add("execute in " + emitter.dimension() + " run kill @e[tag=" + tag + "]");
            lines.add(String.format(Locale.ROOT,
                "execute in %s run summon minecraft:marker %.6f %.6f %.6f {Tags:[\"%s\"]}",
                emitter.dimension(), x, y, z, tag));
            lines.add("execute in " + emitter.dimension() + " run forceload remove " + chunkBlockX + " " + chunkBlockZ);
        }
    }

    private List<String> cleanupLines(PortableProgram program, CompileContext context) {
        List<String> lines = new ArrayList<>();
        if (!program.vanillaCameras().isEmpty()) {
            lines.add("scoreboard players set #enabled " + context.objective + " 0");
            String userTag = cameraUserTag(context.namespace);
            lines.add("execute as @a[tag=" + userTag + "] run spectate");
            lines.add("gamemode adventure @a[tag=" + userTag + "]");
            lines.add("tag @a[tag=" + userTag + "] remove " + userTag);
        }
        for (PortableProgram.VanillaBlockProjection projection : program.vanillaProjections()) {
            appendEntityCleanup(lines, program, projection.dimension(), projectionTag(context.namespace, projection.id()), projection.x(), projection.z());
        }
        for (PortableProgram.VanillaCamera camera : program.vanillaCameras()) {
            appendEntityCleanup(lines, program, camera.dimension(), cameraTag(context.namespace, camera.id()), camera.x(), camera.z());
        }
        for (PortableProgram.VanillaParticleEmitter emitter : program.vanillaParticles()) {
            if (dynamic(emitter.x(), emitter.y(), emitter.z())) {
                appendEntityCleanup(lines, program, emitter.dimension(), particleTag(context.namespace, emitter.id()), emitter.x(), emitter.z());
            }
        }
        lines.add("scoreboard objectives remove " + context.objective);
        return lines;
    }

    private static void appendEntityCleanup(
        List<String> lines,
        PortableProgram program,
        String dimension,
        String tag,
        PortableProgram.VanillaCoordinate xCoordinate,
        PortableProgram.VanillaCoordinate zCoordinate
    ) {
        double x = logicalCoordinate(program, xCoordinate);
        double z = logicalCoordinate(program, zCoordinate);
        int chunkBlockX = (int) Math.floor(x);
        int chunkBlockZ = (int) Math.floor(z);
        lines.add("execute in " + dimension + " run forceload add " + chunkBlockX + " " + chunkBlockZ);
        lines.add("execute in " + dimension + " run kill @e[tag=" + tag + "]");
        lines.add("execute in " + dimension + " run forceload remove " + chunkBlockX + " " + chunkBlockZ);
    }

    private void compileVanillaProjections(PortableProgram program, List<String> lines, CompileContext context) {
        String storeScale = storeScale(program.fixedPoint());
        for (PortableProgram.VanillaBlockProjection projection : program.vanillaProjections()) {
            String tag = projectionTag(context.namespace, projection.id());
            compileEntityAxis(projection.dimension(), tag, "Pos[0]", projection.x(), storeScale, lines, context);
            compileEntityAxis(projection.dimension(), tag, "Pos[1]", projection.y(), storeScale, lines, context);
            compileEntityAxis(projection.dimension(), tag, "Pos[2]", projection.z(), storeScale, lines, context);
        }
    }

    private void compileVanillaCameraUpdates(PortableProgram program, List<String> lines, CompileContext context) {
        String storeScale = storeScale(program.fixedPoint());
        for (PortableProgram.VanillaCamera camera : program.vanillaCameras()) {
            String tag = cameraTag(context.namespace, camera.id());
            compileEntityAxis(camera.dimension(), tag, "Pos[0]", camera.x(), storeScale, lines, context);
            compileEntityAxis(camera.dimension(), tag, "Pos[1]", camera.y(), storeScale, lines, context);
            compileEntityAxis(camera.dimension(), tag, "Pos[2]", camera.z(), storeScale, lines, context);
        }
    }

    private void compileVanillaParticles(PortableProgram program, List<String> lines, CompileContext context) {
        String storeScale = storeScale(program.fixedPoint());
        for (PortableProgram.VanillaParticleEmitter emitter : program.vanillaParticles()) {
            boolean dynamic = dynamic(emitter.x(), emitter.y(), emitter.z());
            String position;
            String executeLocation;
            if (dynamic) {
                String tag = particleTag(context.namespace, emitter.id());
                compileEntityAxis(emitter.dimension(), tag, "Pos[0]", emitter.x(), storeScale, lines, context);
                compileEntityAxis(emitter.dimension(), tag, "Pos[1]", emitter.y(), storeScale, lines, context);
                compileEntityAxis(emitter.dimension(), tag, "Pos[2]", emitter.z(), storeScale, lines, context);
                position = "~ ~ ~";
                executeLocation = "in " + emitter.dimension() + " at @e[tag=" + tag + ",limit=1]";
            } else {
                position = String.format(Locale.ROOT, "%.6f %.6f %.6f",
                    logicalCoordinate(program, emitter.x()),
                    logicalCoordinate(program, emitter.y()),
                    logicalCoordinate(program, emitter.z()));
                executeLocation = "in " + emitter.dimension();
            }
            PortableProgram.VanillaVec3 delta = emitter.delta();
            String particleCommand = "particle " + emitter.particle() + " " + position + " "
                + numberLiteral(delta.x()) + " " + numberLiteral(delta.y()) + " " + numberLiteral(delta.z()) + " "
                + numberLiteral(emitter.speed()) + " " + emitter.count() + (emitter.force() ? " force" : "");
            String prefix = "execute ";
            if (emitter.condition() != null) prefix += condition(emitter.condition(), true, context) + " ";
            lines.add(prefix + executeLocation + " run " + particleCommand);
        }
    }

    private void compileEntityAxis(
        String dimension,
        String tag,
        String nbtPath,
        PortableProgram.VanillaCoordinate coordinate,
        String storeScale,
        List<String> lines,
        CompileContext context
    ) {
        if (!coordinate.dynamic()) return;
        String sourceHolder = stateHolder(coordinate.state());
        if (coordinate.baseRaw() != 0) {
            String temp = context.nextProjectionTemp();
            lines.add("scoreboard players operation " + temp + " " + context.objective + " = " + sourceHolder + " " + context.objective);
            lines.add("scoreboard players operation " + temp + " " + context.objective + " += " + context.constantHolder(coordinate.baseRaw()) + " " + context.objective);
            sourceHolder = temp;
        }
        lines.add("execute in " + dimension + " store result entity @e[tag=" + tag + ",limit=1] " + nbtPath
            + " double " + storeScale + " run scoreboard players get " + sourceHolder + " " + context.objective);
    }

    private static boolean dynamic(PortableProgram.VanillaCoordinate x, PortableProgram.VanillaCoordinate y, PortableProgram.VanillaCoordinate z) {
        return x.dynamic() || y.dynamic() || z.dynamic();
    }

    private static double logicalCoordinate(PortableProgram program, PortableProgram.VanillaCoordinate coordinate) {
        int raw = coordinate.baseRaw();
        if (coordinate.dynamic()) raw = Math.addExact(raw, program.initialState().get(coordinate.state()));
        return program.logicalValue(raw);
    }

    private static String projectionTag(String namespace, String id) {
        return "mcg_v_" + Integer.toUnsignedString(namespace.hashCode(), 36) + "_" + id;
    }

    private static String cameraTag(String namespace, String id) {
        return "mcg_c_" + Integer.toUnsignedString(namespace.hashCode(), 36) + "_" + id;
    }

    private static String cameraUserTag(String namespace) {
        return "mcg_cu_" + Integer.toUnsignedString(namespace.hashCode(), 36);
    }

    private static String particleTag(String namespace, String id) {
        return "mcg_p_" + Integer.toUnsignedString(namespace.hashCode(), 36) + "_" + id;
    }

    private static String storeScale(int fixedPoint) {
        String value = String.format(Locale.ROOT, "%.12f", 1.0 / fixedPoint);
        int end = value.length();
        while (end > 0 && value.charAt(end - 1) == '0') end--;
        if (end > 0 && value.charAt(end - 1) == '.') end++;
        return value.substring(0, end);
    }

    private static String floatLiteral(double value) {
        return numberLiteral(value) + "f";
    }

    private static String numberLiteral(double value) {
        if (value == 0d) return "0";
        String text = String.format(Locale.ROOT, "%.6f", value);
        int end = text.length();
        while (end > 0 && text.charAt(end - 1) == '0') end--;
        if (end > 0 && text.charAt(end - 1) == '.') end--;
        return text.substring(0, end);
    }

    private void compileActions(List<PortableProgram.Action> actions, List<String> lines, CompileContext context) {
        for (PortableProgram.Action action : actions) {
            switch (action) {
                case PortableProgram.SetAction set -> lines.add(setCommand(set.target(), set.value(), context));
                case PortableProgram.AddAction add -> lines.add(addCommand(add.target(), add.value(), context, false));
                case PortableProgram.SubAction sub -> lines.add(addCommand(sub.target(), sub.value(), context, true));
                case PortableProgram.NegateAction negate -> {
                    context.usesNegate = true;
                    lines.add("scoreboard players operation " + stateHolder(negate.target()) + " " + context.objective + " *= #neg1 " + context.objective);
                }
                case PortableProgram.IfAction branch -> {
                    if (!branch.thenActions().isEmpty()) {
                        String function = context.nextBranchFunctionName();
                        List<String> body = new ArrayList<>();
                        compileActions(branch.thenActions(), body, context);
                        context.functions.put(function, body);
                        lines.add("execute " + condition(branch.condition(), true, context) + " run function " + context.namespace + ":portable/" + function);
                    }
                    if (!branch.elseActions().isEmpty()) {
                        String function = context.nextBranchFunctionName();
                        List<String> body = new ArrayList<>();
                        compileActions(branch.elseActions(), body, context);
                        context.functions.put(function, body);
                        lines.add("execute " + condition(branch.condition(), false, context) + " run function " + context.namespace + ":portable/" + function);
                    }
                }
            }
        }
    }

    private String setCommand(String target, PortableProgram.ValueRef value, CompileContext context) {
        if (value instanceof PortableProgram.ConstantValue constant) {
            return "scoreboard players set " + stateHolder(target) + " " + context.objective + " " + constant.raw();
        }
        return "scoreboard players operation " + stateHolder(target) + " " + context.objective + " = " + holder(value, context) + " " + context.objective;
    }

    private String addCommand(String target, PortableProgram.ValueRef value, CompileContext context, boolean subtract) {
        String valueHolder = holder(value, context);
        return "scoreboard players operation " + stateHolder(target) + " " + context.objective
            + (subtract ? " -= " : " += ") + valueHolder + " " + context.objective;
    }

    private String condition(PortableProgram.Condition condition, boolean positive, CompileContext context) {
        String left = holder(condition.left(), context);
        String right = holder(condition.right(), context);
        String comparator = switch (condition.comparison()) {
            case EQ, NE -> "=";
            case LT -> "<";
            case LTE -> "<=";
            case GT -> ">";
            case GTE -> ">=";
        };
        boolean naturallyPositive = condition.comparison() != PortableProgram.Comparison.NE;
        boolean useIf = positive == naturallyPositive;
        return (useIf ? "if" : "unless") + " score " + left + " " + context.objective + " " + comparator + " " + right + " " + context.objective;
    }

    private String holder(PortableProgram.ValueRef value, CompileContext context) {
        return switch (value) {
            case PortableProgram.StateValue state -> stateHolder(state.name());
            case PortableProgram.InputValue input -> inputHolder(input.name());
            case PortableProgram.ConstantValue constant -> context.constantHolder(constant.raw());
        };
    }

    private static String stateHolder(String state) { return "#" + state; }
    private static String inputHolder(String input) { return "#in_" + input; }
    private static String objectiveName(String namespace) { return String.format(Locale.ROOT, "mcg%08x", namespace.hashCode()); }

    private static void writeFunctionTag(Path root, String tag, String function) throws IOException {
        JsonObject json = new JsonObject();
        JsonArray values = new JsonArray();
        values.add(function);
        json.add("values", values);
        write(root.resolve("data").resolve("minecraft").resolve("tags").resolve("function").resolve(tag + ".json"), GSON.toJson(json) + "\n");
    }

    private static void write(Path path, String content) throws IOException {
        Files.createDirectories(path.getParent());
        Files.writeString(path, content, StandardCharsets.UTF_8);
    }

    private static final class CompileContext {
        final String namespace;
        final String objective;
        final Map<Integer, String> constantHolders = new LinkedHashMap<>();
        final Map<String, List<String>> functions = new LinkedHashMap<>();
        int nextConstant;
        int nextBranch;
        int nextProjectionTemp;
        boolean usesNegate;

        CompileContext(String namespace, String objective) {
            this.namespace = namespace;
            this.objective = objective;
        }

        String constantHolder(int raw) {
            return constantHolders.computeIfAbsent(raw, ignored -> "#c" + nextConstant++);
        }

        String nextBranchFunctionName() {
            return String.format(Locale.ROOT, "branch_%03d", nextBranch++);
        }

        String nextProjectionTemp() {
            return "#v" + nextProjectionTemp++;
        }
    }
}
