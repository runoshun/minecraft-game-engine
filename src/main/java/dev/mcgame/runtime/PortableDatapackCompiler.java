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
    private static final Gson COMPACT_GSON = new Gson();
    private static final int MAX_SIDEBAR_SCORE = 15;

    record Result(
        String namespace,
        String objective,
        int stateCount,
        int inputCount,
        int projectionCount,
        int textCount,
        int actorCount,
        int worldBatchCount,
        int cameraCount,
        int particleCount,
        int soundCount,
        int hudCount,
        int sidebarCount,
        int branchFunctionCount
    ) {}

    Result compile(PortableProgram program, String namespace, Path outputRoot) throws IOException {
        if (!NAMESPACE.matcher(namespace).matches()) {
            throw new IllegalArgumentException("portable namespace must match " + NAMESPACE.pattern());
        }
        String objective = objectiveName(namespace);
        CompileContext context = new CompileContext(namespace, objective, program.collisionDivisor());
        List<String> tick = new ArrayList<>();

        compileVanillaCameraAttach(program, tick, context);
        compileVanillaInputs(program, tick, context);
        compileActions(program.tickActions(), tick, context);
        compileVanillaProjections(program, tick, context);
        compileVanillaTextUpdates(program, tick, context);
        compileVanillaActorUpdates(program, tick, context);
        prepareVanillaWorldBatches(program, tick, context);
        compileVanillaCameraUpdates(program, tick, context);
        compileVanillaParticles(program, tick, context);
        compileVanillaSounds(program, tick, context);
        compileVanillaHuds(program, tick, context);
        compileVanillaSidebars(program, tick, context);
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
        compileVanillaWorldBatchLoadCalls(program, load, context);
        compileVanillaProjectionLoad(program, load, context);
        compileVanillaTextLoad(program, load, context);
        compileVanillaActorLoad(program, load, context);
        compileVanillaCameraLoad(program, load, context);
        compileVanillaParticleLoad(program, load, context);
        compileVanillaSoundLoad(program, load, context);
        compileVanillaSidebarLoad(program, load, context);

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
            program.vanillaTexts().size(),
            program.vanillaActors().size(),
            program.vanillaWorldBatches().size(),
            program.vanillaCameras().size(),
            program.vanillaParticles().size(),
            program.vanillaSounds().size(),
            program.vanillaHuds().size(),
            program.vanillaSidebars().size(),
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
            compileVisibility(projection.dimension(), tag, projection.scale(), projection.condition(), lines, context);
            lines.add("execute in " + projection.dimension() + " run forceload remove " + chunkBlockX + " " + chunkBlockZ);
        }
    }

    private void compileVanillaTextLoad(PortableProgram program, List<String> lines, CompileContext context) {
        for (PortableProgram.VanillaTextProjection text : program.vanillaTexts()) {
            String tag = textTag(context.namespace, text.id());
            double x = logicalCoordinate(program, text.x());
            double y = logicalCoordinate(program, text.y());
            double z = logicalCoordinate(program, text.z());
            int chunkBlockX = (int) Math.floor(x);
            int chunkBlockZ = (int) Math.floor(z);
            PortableProgram.VanillaVec3 scale = text.scale();
            prepareTextValues(program, text, lines, context);
            String snbt = "{Tags:[\"" + tag + "\"],text:" + textComponentSnbt(text, context)
                + ",billboard:\"" + text.billboard() + "\",transformation:{translation:[0f,0f,0f],left_rotation:[0f,0f,0f,1f],scale:["
                + floatLiteral(scale.x()) + "," + floatLiteral(scale.y()) + "," + floatLiteral(scale.z())
                + "],right_rotation:[0f,0f,0f,1f]}}";
            lines.add("execute in " + text.dimension() + " run forceload add " + chunkBlockX + " " + chunkBlockZ);
            lines.add("execute in " + text.dimension() + " run kill @e[tag=" + tag + "]");
            lines.add(String.format(Locale.ROOT,
                "execute in %s run summon minecraft:text_display %.6f %.6f %.6f %s",
                text.dimension(), x, y, z, snbt));
            compileVisibility(text.dimension(), tag, text.scale(), text.condition(), lines, context);
            lines.add("execute in " + text.dimension() + " run forceload remove " + chunkBlockX + " " + chunkBlockZ);
        }
    }

    private void compileVanillaActorLoad(PortableProgram program, List<String> lines, CompileContext context) {
        for (PortableProgram.VanillaActorProjection actor : program.vanillaActors()) {
            String tag = actorTag(context.namespace, actor.id());
            double x = logicalCoordinate(program, actor.x());
            double z = logicalCoordinate(program, actor.z());
            int chunkBlockX = (int) Math.floor(x);
            int chunkBlockZ = (int) Math.floor(z);
            ensureActorSpawnFunction(program, actor, context);
            lines.add("execute in " + actor.dimension() + " run forceload add " + chunkBlockX + " " + chunkBlockZ);
            lines.add("execute in " + actor.dimension() + " run kill @e[tag=" + tag + "]");
            String spawnFunction = context.namespace + ":portable/actor_" + actor.id() + "_spawn";
            if (actor.condition() == null) {
                lines.add("function " + spawnFunction);
            } else {
                lines.add("execute " + condition(actor.condition(), true, context) + " run function " + spawnFunction);
            }
            lines.add("execute in " + actor.dimension() + " run forceload remove " + chunkBlockX + " " + chunkBlockZ);
        }
    }

    private void ensureActorSpawnFunction(PortableProgram program, PortableProgram.VanillaActorProjection actor, CompileContext context) {
        String function = "actor_" + actor.id() + "_spawn";
        if (context.functions.containsKey(function)) return;
        String tag = actorTag(context.namespace, actor.id());
        double x = logicalCoordinate(program, actor.x());
        double y = logicalCoordinate(program, actor.y());
        double z = logicalCoordinate(program, actor.z());
        double yaw = logicalCoordinate(program, actor.yaw());
        int chunkBlockX = (int) Math.floor(x);
        int chunkBlockZ = (int) Math.floor(z);
        List<String> body = new ArrayList<>();
        body.add("execute in " + actor.dimension() + " run forceload add " + chunkBlockX + " " + chunkBlockZ);
        String snbt = String.format(Locale.ROOT,
            "{Tags:[\"%s\"],NoGravity:1b,Invulnerable:1b,Silent:1b,Rotation:[%.3ff,0f]}", tag, yaw);
        body.add(String.format(Locale.ROOT,
            "execute in %s run summon minecraft:mannequin %.6f %.6f %.6f %s", actor.dimension(), x, y, z, snbt));
        String headItem = switch (actor.entityType()) {
            case "minecraft:zombie" -> "minecraft:zombie_head";
            case "minecraft:skeleton" -> "minecraft:skeleton_skull";
            default -> null;
        };
        if (headItem != null) {
            body.add("execute in " + actor.dimension() + " run item replace entity @e[tag=" + tag + ",limit=1] armor.head with " + headItem);
        }
        body.add("execute in " + actor.dimension() + " run forceload remove " + chunkBlockX + " " + chunkBlockZ);
        context.functions.put(function, body);
    }

    private void prepareVanillaWorldBatches(PortableProgram program, List<String> tick, CompileContext context) {
        for (PortableProgram.VanillaWorldBatch batch : program.vanillaWorldBatches()) {
            ensureWorldBatchFunction(batch, context);
            if (batch.condition() != null) {
                tick.add("execute " + condition(batch.condition(), true, context) + " run function "
                    + context.namespace + ":portable/world_" + batch.id());
            }
        }
    }

    private void compileVanillaWorldBatchLoadCalls(PortableProgram program, List<String> load, CompileContext context) {
        for (PortableProgram.VanillaWorldBatch batch : program.vanillaWorldBatches()) {
            if (batch.condition() == null) {
                load.add("function " + context.namespace + ":portable/world_" + batch.id());
            }
        }
    }

    private void ensureWorldBatchFunction(PortableProgram.VanillaWorldBatch batch, CompileContext context) {
        String function = "world_" + batch.id();
        if (context.functions.containsKey(function)) return;

        Map<String, List<PortableProgram.VanillaWorldBlockWrite>> byChunk = new LinkedHashMap<>();
        for (PortableProgram.VanillaWorldBlockWrite write : batch.blocks()) {
            int chunkX = Math.floorDiv(write.x(), 16);
            int chunkZ = Math.floorDiv(write.z(), 16);
            String key = chunkX + "," + chunkZ;
            byChunk.computeIfAbsent(key, ignored -> new ArrayList<>()).add(write);
        }

        List<String> body = new ArrayList<>();
        for (List<PortableProgram.VanillaWorldBlockWrite> chunkWrites : byChunk.values()) {
            PortableProgram.VanillaWorldBlockWrite first = chunkWrites.getFirst();
            int chunkBlockX = Math.floorDiv(first.x(), 16) * 16;
            int chunkBlockZ = Math.floorDiv(first.z(), 16) * 16;
            body.add("execute in " + batch.dimension() + " run forceload add " + chunkBlockX + " " + chunkBlockZ);
            for (PortableProgram.VanillaWorldBlockWrite write : chunkWrites) {
                body.add("execute in " + batch.dimension() + " run setblock "
                    + write.x() + " " + write.y() + " " + write.z() + " " + write.block());
            }
            body.add("execute in " + batch.dimension() + " run forceload remove " + chunkBlockX + " " + chunkBlockZ);
        }
        context.functions.put(function, body);
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

    private void compileVanillaSoundLoad(PortableProgram program, List<String> lines, CompileContext context) {
        for (PortableProgram.VanillaSoundEmitter emitter : program.vanillaSounds()) {
            if (!dynamic(emitter.x(), emitter.y(), emitter.z())) continue;
            String tag = soundTag(context.namespace, emitter.id());
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
        if (!program.vanillaHuds().isEmpty()) {
            lines.add("execute as " + controllerSelector(program, context) + " run title @s actionbar {\"text\":\"\"}");
        }
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
        for (PortableProgram.VanillaTextProjection text : program.vanillaTexts()) {
            appendEntityCleanup(lines, program, text.dimension(), textTag(context.namespace, text.id()), text.x(), text.z());
        }
        for (PortableProgram.VanillaActorProjection actor : program.vanillaActors()) {
            appendEntityCleanup(lines, program, actor.dimension(), actorTag(context.namespace, actor.id()), actor.x(), actor.z());
        }
        for (PortableProgram.VanillaCamera camera : program.vanillaCameras()) {
            appendEntityCleanup(lines, program, camera.dimension(), cameraTag(context.namespace, camera.id()), camera.x(), camera.z());
        }
        for (PortableProgram.VanillaParticleEmitter emitter : program.vanillaParticles()) {
            if (dynamic(emitter.x(), emitter.y(), emitter.z())) {
                appendEntityCleanup(lines, program, emitter.dimension(), particleTag(context.namespace, emitter.id()), emitter.x(), emitter.z());
            }
        }
        for (PortableProgram.VanillaSoundEmitter emitter : program.vanillaSounds()) {
            if (dynamic(emitter.x(), emitter.y(), emitter.z())) {
                appendEntityCleanup(lines, program, emitter.dimension(), soundTag(context.namespace, emitter.id()), emitter.x(), emitter.z());
            }
        }
        if (!program.vanillaSidebars().isEmpty()) {
            lines.add("scoreboard objectives remove " + sidebarObjectiveName(context.namespace));
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
            compileVisibility(projection.dimension(), tag, projection.scale(), projection.condition(), lines, context);
        }
    }

    private void compileVanillaTextUpdates(PortableProgram program, List<String> lines, CompileContext context) {
        String storeScale = storeScale(program.fixedPoint());
        for (PortableProgram.VanillaTextProjection text : program.vanillaTexts()) {
            String tag = textTag(context.namespace, text.id());
            compileEntityAxis(text.dimension(), tag, "Pos[0]", text.x(), storeScale, lines, context);
            compileEntityAxis(text.dimension(), tag, "Pos[1]", text.y(), storeScale, lines, context);
            compileEntityAxis(text.dimension(), tag, "Pos[2]", text.z(), storeScale, lines, context);
            if (text.dynamicText()) {
                prepareTextValues(program, text, lines, context);
                lines.add("execute in " + text.dimension() + " if entity @e[tag=" + tag + ",limit=1] run data modify entity @e[tag=" + tag + ",limit=1] text set value "
                    + textComponentSnbt(text, context));
            }
            compileVisibility(text.dimension(), tag, text.scale(), text.condition(), lines, context);
        }
    }

    private void prepareTextValues(
        PortableProgram program,
        PortableProgram.VanillaTextProjection text,
        List<String> lines,
        CompileContext context
    ) {
        for (int i = 0; i < text.tokens().size(); i++) {
            PortableProgram.HudToken token = text.tokens().get(i);
            if (!(token instanceof PortableProgram.HudValue value)) continue;
            String temp = context.textValueHolder(text.id(), i);
            lines.add("scoreboard players operation " + temp + " " + context.objective + " = " + holder(value.value(), context) + " " + context.objective);
            if (program.fixedPoint() != 1) {
                lines.add("scoreboard players operation " + temp + " " + context.objective + " /= "
                    + context.constantHolder(program.fixedPoint()) + " " + context.objective);
            }
        }
    }

    private static String textComponentSnbt(PortableProgram.VanillaTextProjection text, CompileContext context) {
        if (text.tokens().size() == 1 && text.tokens().getFirst() instanceof PortableProgram.HudLiteral literal) {
            return "{text:" + snbtQuoted(literal.text()) + "}";
        }
        StringBuilder out = new StringBuilder("{text:\"\",extra:[");
        for (int i = 0; i < text.tokens().size(); i++) {
            if (i > 0) out.append(',');
            PortableProgram.HudToken token = text.tokens().get(i);
            if (token instanceof PortableProgram.HudLiteral literal) {
                out.append("{text:").append(snbtQuoted(literal.text())).append('}');
            } else if (token instanceof PortableProgram.HudValue) {
                out.append("{score:{name:").append(snbtQuoted(context.textValueHolder(text.id(), i)))
                    .append(",objective:").append(snbtQuoted(context.objective)).append("}}");
            }
        }
        return out.append("]}").toString();
    }

    private void compileVisibility(
        String dimension,
        String tag,
        PortableProgram.VanillaVec3 scale,
        PortableProgram.Condition visibility,
        List<String> lines,
        CompileContext context
    ) {
        if (visibility == null) return;
        String selector = "@e[tag=" + tag + ",limit=1]";
        String shown = "[" + floatLiteral(scale.x()) + "," + floatLiteral(scale.y()) + "," + floatLiteral(scale.z()) + "]";
        String hidden = "[0f,0f,0f]";
        lines.add("execute " + condition(visibility, true, context) + " in " + dimension
            + " run data modify entity " + selector + " transformation.scale set value " + shown);
        lines.add("execute " + condition(visibility, false, context) + " in " + dimension
            + " run data modify entity " + selector + " transformation.scale set value " + hidden);
    }

    private void compileVanillaActorUpdates(PortableProgram program, List<String> lines, CompileContext context) {
        String storeScale = storeScale(program.fixedPoint());
        for (PortableProgram.VanillaActorProjection actor : program.vanillaActors()) {
            String tag = actorTag(context.namespace, actor.id());
            ensureActorSpawnFunction(program, actor, context);
            String spawnFunction = context.namespace + ":portable/actor_" + actor.id() + "_spawn";
            if (actor.condition() != null) {
                lines.add("execute " + condition(actor.condition(), true, context) + " in " + actor.dimension()
                    + " unless entity @e[tag=" + tag + ",limit=1] run function " + spawnFunction);
                lines.add("execute " + condition(actor.condition(), false, context) + " in " + actor.dimension()
                    + " if entity @e[tag=" + tag + ",limit=1] run kill @e[tag=" + tag + "]");
            }
            compileEntityAxis(actor.dimension(), tag, "Pos[0]", actor.x(), storeScale, lines, context);
            compileEntityAxis(actor.dimension(), tag, "Pos[1]", actor.y(), storeScale, lines, context);
            compileEntityAxis(actor.dimension(), tag, "Pos[2]", actor.z(), storeScale, lines, context);
            compileEntityFloat(actor.dimension(), tag, "Rotation[0]", actor.yaw(), storeScale, lines, context);
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

    private void compileVanillaSounds(PortableProgram program, List<String> lines, CompileContext context) {
        String storeScale = storeScale(program.fixedPoint());
        for (PortableProgram.VanillaSoundEmitter emitter : program.vanillaSounds()) {
            boolean isDynamic = dynamic(emitter.x(), emitter.y(), emitter.z());
            String position;
            String executeLocation;
            if (isDynamic) {
                String tag = soundTag(context.namespace, emitter.id());
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
            String command = "playsound " + emitter.sound() + " master @a " + position + " "
                + numberLiteral(emitter.volume()) + " " + numberLiteral(emitter.pitch());
            String prefix = "execute ";
            if (emitter.condition() != null) prefix += condition(emitter.condition(), true, context) + " ";
            lines.add(prefix + executeLocation + " run " + command);
        }
    }

    private void compileVanillaHuds(PortableProgram program, List<String> lines, CompileContext context) {
        if (program.vanillaHuds().isEmpty()) return;
        PortableProgram.VanillaHud hud = program.vanillaHuds().getFirst();
        JsonArray component = new JsonArray();
        int index = 0;
        for (PortableProgram.HudToken token : hud.tokens()) {
            if (token instanceof PortableProgram.HudLiteral literal) {
                JsonObject part = new JsonObject();
                part.addProperty("text", literal.text());
                component.add(part);
            } else if (token instanceof PortableProgram.HudValue value) {
                String temp = context.nextHudTemp();
                lines.add("scoreboard players operation " + temp + " " + context.objective + " = " + holder(value.value(), context) + " " + context.objective);
                if (program.fixedPoint() != 1) {
                    lines.add("scoreboard players operation " + temp + " " + context.objective + " /= "
                        + context.constantHolder(program.fixedPoint()) + " " + context.objective);
                }
                JsonObject part = new JsonObject();
                JsonObject score = new JsonObject();
                score.addProperty("name", temp);
                score.addProperty("objective", context.objective);
                part.add("score", score);
                component.add(part);
                index++;
            }
        }
        lines.add("execute as " + controllerSelector(program, context) + " run title @s actionbar " + COMPACT_GSON.toJson(component));
    }

    private void compileVanillaSidebarLoad(PortableProgram program, List<String> lines, CompileContext context) {
        if (program.vanillaSidebars().isEmpty()) return;
        PortableProgram.VanillaSidebar sidebar = program.vanillaSidebars().getFirst();
        String objective = sidebarObjectiveName(context.namespace);
        JsonObject title = new JsonObject();
        title.addProperty("text", sidebar.title());
        lines.add("scoreboard objectives remove " + objective);
        lines.add("scoreboard objectives add " + objective + " dummy " + COMPACT_GSON.toJson(title));
        for (int i = 0; i < sidebar.rows().size(); i++) {
            String holder = sidebarRowHolder(i);
            lines.add("scoreboard players set " + holder + " " + objective + " " + (MAX_SIDEBAR_SCORE - i));
            lines.add("scoreboard players display numberformat " + holder + " " + objective + " blank");
        }
        lines.add("scoreboard objectives setdisplay sidebar " + objective);
    }

    private void compileVanillaSidebars(PortableProgram program, List<String> lines, CompileContext context) {
        if (program.vanillaSidebars().isEmpty()) return;
        PortableProgram.VanillaSidebar sidebar = program.vanillaSidebars().getFirst();
        String sidebarObjective = sidebarObjectiveName(context.namespace);
        for (int rowIndex = 0; rowIndex < sidebar.rows().size(); rowIndex++) {
            PortableProgram.VanillaSidebarRow row = sidebar.rows().get(rowIndex);
            JsonObject component = new JsonObject();
            component.addProperty("text", "");
            JsonArray extra = new JsonArray();
            for (int tokenIndex = 0; tokenIndex < row.tokens().size(); tokenIndex++) {
                PortableProgram.HudToken token = row.tokens().get(tokenIndex);
                JsonObject part = new JsonObject();
                if (token instanceof PortableProgram.HudLiteral literal) {
                    part.addProperty("text", literal.text());
                } else if (token instanceof PortableProgram.HudValue value) {
                    String temp = context.sidebarValueHolder(sidebar.id(), row.id(), tokenIndex);
                    lines.add("scoreboard players operation " + temp + " " + context.objective + " = " + holder(value.value(), context) + " " + context.objective);
                    if (program.fixedPoint() != 1) {
                        lines.add("scoreboard players operation " + temp + " " + context.objective + " /= "
                            + context.constantHolder(program.fixedPoint()) + " " + context.objective);
                    }
                    JsonObject score = new JsonObject();
                    score.addProperty("name", temp);
                    score.addProperty("objective", context.objective);
                    part.add("score", score);
                }
                extra.add(part);
            }
            component.add("extra", extra);
            lines.add("scoreboard players display name " + sidebarRowHolder(rowIndex) + " " + sidebarObjective + " " + COMPACT_GSON.toJson(component));
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

    private void compileEntityFloat(
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
            + " float " + storeScale + " run scoreboard players get " + sourceHolder + " " + context.objective);
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

    private static String textTag(String namespace, String id) {
        return "mcg_t_" + Integer.toUnsignedString(namespace.hashCode(), 36) + "_" + id;
    }

    private static String actorTag(String namespace, String id) {
        return "mcg_a_" + Integer.toUnsignedString(namespace.hashCode(), 36) + "_" + id;
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

    private static String soundTag(String namespace, String id) {
        return "mcg_s_" + Integer.toUnsignedString(namespace.hashCode(), 36) + "_" + id;
    }

    private static String snbtQuoted(String value) {
        return "\"" + value.replace("\\", "\\\\").replace("\"", "\\\"") + "\"";
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
                case PortableProgram.AabbIfAction branch -> compileAabbIf(branch, lines, context);
                case PortableProgram.CircleIfAction branch -> compileCircleIf(branch, lines, context);
                case PortableProgram.CircleCapsuleIfAction branch -> compileCircleCapsuleIf(branch, lines, context);
                case PortableProgram.TriggerIfAction branch -> compileTriggerIf(branch, lines, context);
            }
        }
    }

    private void compileAabbIf(PortableProgram.AabbIfAction branch, List<String> lines, CompileContext context) {
        String aLeft = aabbEdge(branch.a().x(), -branch.a().halfWidthRaw(), lines, context);
        String aRight = aabbEdge(branch.a().x(), branch.a().halfWidthRaw(), lines, context);
        String aBottom = aabbEdge(branch.a().y(), -branch.a().halfHeightRaw(), lines, context);
        String aTop = aabbEdge(branch.a().y(), branch.a().halfHeightRaw(), lines, context);
        String bLeft = aabbEdge(branch.b().x(), -branch.b().halfWidthRaw(), lines, context);
        String bRight = aabbEdge(branch.b().x(), branch.b().halfWidthRaw(), lines, context);
        String bBottom = aabbEdge(branch.b().y(), -branch.b().halfHeightRaw(), lines, context);
        String bTop = aabbEdge(branch.b().y(), branch.b().halfHeightRaw(), lines, context);
        String flag = context.nextCollisionTemp();
        lines.add("scoreboard players set " + flag + " " + context.objective + " 0");
        lines.add("execute if score " + aLeft + " " + context.objective + " <= " + bRight + " " + context.objective
            + " if score " + aRight + " " + context.objective + " >= " + bLeft + " " + context.objective
            + " if score " + aBottom + " " + context.objective + " <= " + bTop + " " + context.objective
            + " if score " + aTop + " " + context.objective + " >= " + bBottom + " " + context.objective
            + " run scoreboard players set " + flag + " " + context.objective + " 1");
        if (!branch.thenActions().isEmpty()) {
            String function = context.nextBranchFunctionName();
            List<String> body = new ArrayList<>();
            compileActions(branch.thenActions(), body, context);
            context.functions.put(function, body);
            lines.add("execute if score " + flag + " " + context.objective + " matches 1 run function " + context.namespace + ":portable/" + function);
        }
        if (!branch.elseActions().isEmpty()) {
            String function = context.nextBranchFunctionName();
            List<String> body = new ArrayList<>();
            compileActions(branch.elseActions(), body, context);
            context.functions.put(function, body);
            lines.add("execute unless score " + flag + " " + context.objective + " matches 1 run function " + context.namespace + ":portable/" + function);
        }
    }

    private void compileCircleIf(PortableProgram.CircleIfAction branch, List<String> lines, CompileContext context) {
        int divisor = Math.max(1, context.fixedPointDivisor);
        String dx = context.nextCollisionTemp();
        lines.add("scoreboard players operation " + dx + " " + context.objective + " = " + holder(branch.a().x(), context) + " " + context.objective);
        lines.add("scoreboard players operation " + dx + " " + context.objective + " -= " + holder(branch.b().x(), context) + " " + context.objective);
        if (divisor > 1) lines.add("scoreboard players operation " + dx + " " + context.objective + " /= " + context.constantHolder(divisor) + " " + context.objective);
        lines.add("scoreboard players operation " + dx + " " + context.objective + " *= " + dx + " " + context.objective);

        String dy = context.nextCollisionTemp();
        lines.add("scoreboard players operation " + dy + " " + context.objective + " = " + holder(branch.a().y(), context) + " " + context.objective);
        lines.add("scoreboard players operation " + dy + " " + context.objective + " -= " + holder(branch.b().y(), context) + " " + context.objective);
        if (divisor > 1) lines.add("scoreboard players operation " + dy + " " + context.objective + " /= " + context.constantHolder(divisor) + " " + context.objective);
        lines.add("scoreboard players operation " + dy + " " + context.objective + " *= " + dy + " " + context.objective);
        lines.add("scoreboard players operation " + dx + " " + context.objective + " += " + dy + " " + context.objective);

        long radiusUnits = (branch.a().radiusRaw() + (long) branch.b().radiusRaw()) / divisor;
        long radiusSquared = radiusUnits * radiusUnits;
        if (radiusSquared > Integer.MAX_VALUE) {
            throw new IllegalArgumentException("portable circle collision radius exceeds scoreboard squared range");
        }
        String radius = context.constantHolder((int) radiusSquared);
        compileCollisionBranches(dx, "<=", radius, branch.thenActions(), branch.elseActions(), lines, context);
    }

    private void compileCircleCapsuleIf(PortableProgram.CircleCapsuleIfAction branch, List<String> lines, CompileContext context) {
        int divisor = Math.max(1, context.fixedPointDivisor);
        PortableProgram.Capsule2d capsule = branch.capsule();
        int ax = capsule.axRaw() / divisor;
        int ay = capsule.ayRaw() / divisor;
        int bx = capsule.bxRaw() / divisor;
        int by = capsule.byRaw() / divisor;
        int vx = bx - ax;
        int vy = by - ay;
        long len2Long = (long) vx * vx + (long) vy * vy;
        if (len2Long <= 0 || len2Long > Integer.MAX_VALUE) {
            throw new IllegalArgumentException("portable capsule length is outside scoreboard collision range");
        }
        int len2 = (int) len2Long;
        long radiusUnitsLong = (branch.circle().radiusRaw() + (long) capsule.radiusRaw()) / divisor;
        long radiusSquaredLong = radiusUnitsLong * radiusUnitsLong;
        if (radiusUnitsLong < 0 || radiusUnitsLong > Integer.MAX_VALUE || radiusSquaredLong > Integer.MAX_VALUE) {
            throw new IllegalArgumentException("portable circle/capsule radius exceeds scoreboard collision range");
        }
        int radius = (int) radiusUnitsLong;
        int radiusSquared = (int) radiusSquaredLong;

        String px = context.nextCollisionTemp();
        lines.add("scoreboard players operation " + px + " " + context.objective + " = " + holder(branch.circle().x(), context) + " " + context.objective);
        if (divisor > 1) lines.add("scoreboard players operation " + px + " " + context.objective + " /= " + context.constantHolder(divisor) + " " + context.objective);
        String py = context.nextCollisionTemp();
        lines.add("scoreboard players operation " + py + " " + context.objective + " = " + holder(branch.circle().y(), context) + " " + context.objective);
        if (divisor > 1) lines.add("scoreboard players operation " + py + " " + context.objective + " /= " + context.constantHolder(divisor) + " " + context.objective);

        String flag = context.nextCollisionTemp();
        lines.add("scoreboard players set " + flag + " " + context.objective + " 0");

        List<String> detail = new ArrayList<>();
        String wx = context.nextCollisionTemp();
        detail.add("scoreboard players operation " + wx + " " + context.objective + " = " + px + " " + context.objective);
        detail.add("scoreboard players operation " + wx + " " + context.objective + " -= " + context.constantHolder(ax) + " " + context.objective);
        String wy = context.nextCollisionTemp();
        detail.add("scoreboard players operation " + wy + " " + context.objective + " = " + py + " " + context.objective);
        detail.add("scoreboard players operation " + wy + " " + context.objective + " -= " + context.constantHolder(ay) + " " + context.objective);

        String dot = context.nextCollisionTemp();
        detail.add("scoreboard players operation " + dot + " " + context.objective + " = " + wx + " " + context.objective);
        detail.add("scoreboard players operation " + dot + " " + context.objective + " *= " + context.constantHolder(vx) + " " + context.objective);
        String dotY = context.nextCollisionTemp();
        detail.add("scoreboard players operation " + dotY + " " + context.objective + " = " + wy + " " + context.objective);
        detail.add("scoreboard players operation " + dotY + " " + context.objective + " *= " + context.constantHolder(vy) + " " + context.objective);
        detail.add("scoreboard players operation " + dot + " " + context.objective + " += " + dotY + " " + context.objective);

        String distA = squaredDistance(wx, wy, detail, context);
        String dxB = context.nextCollisionTemp();
        detail.add("scoreboard players operation " + dxB + " " + context.objective + " = " + px + " " + context.objective);
        detail.add("scoreboard players operation " + dxB + " " + context.objective + " -= " + context.constantHolder(bx) + " " + context.objective);
        String dyB = context.nextCollisionTemp();
        detail.add("scoreboard players operation " + dyB + " " + context.objective + " = " + py + " " + context.objective);
        detail.add("scoreboard players operation " + dyB + " " + context.objective + " -= " + context.constantHolder(by) + " " + context.objective);
        String distB = squaredDistance(dxB, dyB, detail, context);

        String cross = context.nextCollisionTemp();
        detail.add("scoreboard players operation " + cross + " " + context.objective + " = " + wx + " " + context.objective);
        detail.add("scoreboard players operation " + cross + " " + context.objective + " *= " + context.constantHolder(vy) + " " + context.objective);
        String crossOther = context.nextCollisionTemp();
        detail.add("scoreboard players operation " + crossOther + " " + context.objective + " = " + wy + " " + context.objective);
        detail.add("scoreboard players operation " + crossOther + " " + context.objective + " *= " + context.constantHolder(vx) + " " + context.objective);
        detail.add("scoreboard players operation " + cross + " " + context.objective + " -= " + crossOther + " " + context.objective);

        String radiusSquaredHolder = context.constantHolder(radiusSquared);
        String len2Holder = context.constantHolder(len2);
        long crossLimitSquared = radiusSquaredLong * len2Long;
        int crossLimit = (int) Math.floor(Math.sqrt(crossLimitSquared));
        detail.add("execute if score " + dot + " " + context.objective + " matches ..0 if score " + distA + " " + context.objective + " <= " + radiusSquaredHolder + " " + context.objective
            + " run scoreboard players set " + flag + " " + context.objective + " 1");
        detail.add("execute if score " + dot + " " + context.objective + " matches 1.. if score " + dot + " " + context.objective + " < " + len2Holder + " " + context.objective
            + " if score " + cross + " " + context.objective + " matches " + (-crossLimit) + ".." + crossLimit
            + " run scoreboard players set " + flag + " " + context.objective + " 1");
        detail.add("execute if score " + dot + " " + context.objective + " >= " + len2Holder + " " + context.objective + " if score " + distB + " " + context.objective + " <= " + radiusSquaredHolder + " " + context.objective
            + " run scoreboard players set " + flag + " " + context.objective + " 1");

        String detailFunction = context.nextBranchFunctionName();
        context.functions.put(detailFunction, detail);
        int minX = Math.min(ax, bx) - radius;
        int maxX = Math.max(ax, bx) + radius;
        int minY = Math.min(ay, by) - radius;
        int maxY = Math.max(ay, by) + radius;
        lines.add("execute if score " + px + " " + context.objective + " matches " + minX + ".." + maxX
            + " if score " + py + " " + context.objective + " matches " + minY + ".." + maxY
            + " run function " + context.namespace + ":portable/" + detailFunction);
        compileBooleanBranches(flag, branch.thenActions(), branch.elseActions(), lines, context);
    }

    private void compileTriggerIf(PortableProgram.TriggerIfAction branch, List<String> lines, CompileContext context) {
        String left = aabbEdge(branch.trigger().x(), -branch.trigger().halfWidthRaw(), lines, context);
        String right = aabbEdge(branch.trigger().x(), branch.trigger().halfWidthRaw(), lines, context);
        String bottom = aabbEdge(branch.trigger().y(), -branch.trigger().halfHeightRaw(), lines, context);
        String top = aabbEdge(branch.trigger().y(), branch.trigger().halfHeightRaw(), lines, context);
        String flag = context.nextCollisionTemp();
        lines.add("scoreboard players set " + flag + " " + context.objective + " 0");
        lines.add("execute if score " + holder(branch.point().x(), context) + " " + context.objective + " >= " + left + " " + context.objective
            + " if score " + holder(branch.point().x(), context) + " " + context.objective + " <= " + right + " " + context.objective
            + " if score " + holder(branch.point().y(), context) + " " + context.objective + " >= " + bottom + " " + context.objective
            + " if score " + holder(branch.point().y(), context) + " " + context.objective + " <= " + top + " " + context.objective
            + " run scoreboard players set " + flag + " " + context.objective + " 1");
        compileBooleanBranches(flag, branch.thenActions(), branch.elseActions(), lines, context);
    }

    private String squaredDistance(String dx, String dy, List<String> lines, CompileContext context) {
        String dxSquared = context.nextCollisionTemp();
        lines.add("scoreboard players operation " + dxSquared + " " + context.objective + " = " + dx + " " + context.objective);
        lines.add("scoreboard players operation " + dxSquared + " " + context.objective + " *= " + dxSquared + " " + context.objective);
        String dySquared = context.nextCollisionTemp();
        lines.add("scoreboard players operation " + dySquared + " " + context.objective + " = " + dy + " " + context.objective);
        lines.add("scoreboard players operation " + dySquared + " " + context.objective + " *= " + dySquared + " " + context.objective);
        lines.add("scoreboard players operation " + dxSquared + " " + context.objective + " += " + dySquared + " " + context.objective);
        return dxSquared;
    }

    private void compileBooleanBranches(
        String flag,
        List<PortableProgram.Action> thenActions,
        List<PortableProgram.Action> elseActions,
        List<String> lines,
        CompileContext context
    ) {
        if (!thenActions.isEmpty()) {
            String function = context.nextBranchFunctionName();
            List<String> body = new ArrayList<>();
            compileActions(thenActions, body, context);
            context.functions.put(function, body);
            lines.add("execute if score " + flag + " " + context.objective + " matches 1 run function " + context.namespace + ":portable/" + function);
        }
        if (!elseActions.isEmpty()) {
            String function = context.nextBranchFunctionName();
            List<String> body = new ArrayList<>();
            compileActions(elseActions, body, context);
            context.functions.put(function, body);
            lines.add("execute unless score " + flag + " " + context.objective + " matches 1 run function " + context.namespace + ":portable/" + function);
        }
    }

    private void compileCollisionBranches(
        String left,
        String comparator,
        String right,
        List<PortableProgram.Action> thenActions,
        List<PortableProgram.Action> elseActions,
        List<String> lines,
        CompileContext context
    ) {
        if (!thenActions.isEmpty()) {
            String function = context.nextBranchFunctionName();
            List<String> body = new ArrayList<>();
            compileActions(thenActions, body, context);
            context.functions.put(function, body);
            lines.add("execute if score " + left + " " + context.objective + " " + comparator + " " + right + " " + context.objective
                + " run function " + context.namespace + ":portable/" + function);
        }
        if (!elseActions.isEmpty()) {
            String function = context.nextBranchFunctionName();
            List<String> body = new ArrayList<>();
            compileActions(elseActions, body, context);
            context.functions.put(function, body);
            lines.add("execute unless score " + left + " " + context.objective + " " + comparator + " " + right + " " + context.objective
                + " run function " + context.namespace + ":portable/" + function);
        }
    }

    private String aabbEdge(PortableProgram.ValueRef center, int offset, List<String> lines, CompileContext context) {
        String temp = context.nextCollisionTemp();
        lines.add("scoreboard players operation " + temp + " " + context.objective + " = " + holder(center, context) + " " + context.objective);
        if (offset != 0) {
            lines.add("scoreboard players operation " + temp + " " + context.objective + (offset > 0 ? " += " : " -= ")
                + context.constantHolder(Math.abs(offset)) + " " + context.objective);
        }
        return temp;
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
    private static String sidebarObjectiveName(String namespace) { return String.format(Locale.ROOT, "mcgu%08x", namespace.hashCode()); }
    private static String sidebarRowHolder(int index) { return String.format(Locale.ROOT, "r%02d", index); }

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
        final int fixedPointDivisor;
        final Map<Integer, String> constantHolders = new LinkedHashMap<>();
        final Map<String, String> textValueHolders = new LinkedHashMap<>();
        final Map<String, String> sidebarValueHolders = new LinkedHashMap<>();
        final Map<String, List<String>> functions = new LinkedHashMap<>();
        int nextConstant;
        int nextBranch;
        int nextProjectionTemp;
        int nextHudTemp;
        int nextTextTemp;
        int nextSidebarTemp;
        int nextCollisionTemp;
        boolean usesNegate;

        CompileContext(String namespace, String objective, int fixedPointDivisor) {
            this.namespace = namespace;
            this.objective = objective;
            this.fixedPointDivisor = fixedPointDivisor;
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

        String nextHudTemp() {
            return "#h" + nextHudTemp++;
        }

        String textValueHolder(String textId, int tokenIndex) {
            return textValueHolders.computeIfAbsent(textId + ":" + tokenIndex, ignored -> "#t" + nextTextTemp++);
        }

        String sidebarValueHolder(String sidebarId, String rowId, int tokenIndex) {
            return sidebarValueHolders.computeIfAbsent(sidebarId + ":" + rowId + ":" + tokenIndex, ignored -> "#u" + nextSidebarTemp++);
        }

        String nextCollisionTemp() {
            return "#q" + nextCollisionTemp++;
        }
    }
}
