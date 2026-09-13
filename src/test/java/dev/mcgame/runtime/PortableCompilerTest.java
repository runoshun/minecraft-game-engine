package dev.mcgame.runtime;

import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class PortableCompilerTest {
    @Test
    void versionOneStateMachineAndDatapackCompilerRemainCompatible() throws Exception {
        String source = """
            portable.define({
              version: 1,
              fixedPoint: 1000,
              state: { x: 0, vx: 0.5 },
              tick: [
                { op: "add", target: "x", value: { state: "vx" } },
                { op: "if", condition: { op: "gte", left: { state: "x" }, right: 1 }, then: [
                  { op: "set", target: "x", value: 1 },
                  { op: "negate", target: "vx" }
                ] },
                { op: "if", condition: { op: "lte", left: { state: "x" }, right: -1 }, then: [
                  { op: "set", target: "x", value: -1 },
                  { op: "negate", target: "vx" }
                ] }
              ]
            });
            game.onTick(() => game.log(portable.get("x")));
            """;

        PortableProgram program = extract(source);
        assertEquals(1, program.version());
        PortableStateMachine machine = new PortableStateMachine(program);
        machine.tick();
        assertEquals(0.5, machine.get("x"), 0.0001);
        machine.tick();
        assertEquals(1.0, machine.get("x"), 0.0001);
        assertEquals(-0.5, machine.get("vx"), 0.0001);
        machine.tick();
        assertEquals(0.5, machine.get("x"), 0.0001);

        Path output = Files.createTempDirectory("mcgame-portable-test");
        PortableDatapackCompiler.Result result = new PortableDatapackCompiler().compile(program, "portable_test", output);
        assertEquals(0, result.inputCount());
        assertTrue(result.objective().startsWith("mcg"));
        String tick = Files.readString(output.resolve("data/portable_test/function/portable/tick.mcfunction"));
        assertTrue(tick.contains("scoreboard players operation #x"));
        assertTrue(tick.contains("run function portable_test:portable/branch_000"));
    }

    @Test
    void versionTwoInputRegistersMatchRuntimeAndDatapackAbi() throws Exception {
        String source = """
            portable.define({
              version: 2,
              fixedPoint: 1000,
              state: { x: 0 },
              inputs: { drive: 0.25, launch: 0, hotbarSlot: 4 },
              vanilla: {
                inputs: { hotbarSlot: { source: "first_player_hotbar_slot" } },
                projections: [{
                  id: "probe",
                  block: "minecraft:sea_lantern",
                  x: { state: "x", base: 10 },
                  y: 64,
                  z: 0,
                  scale: 0.5,
                  translation: { x: -0.25, y: -0.25, z: -0.25 }
                }]
              },
              tick: [
                { op: "add", target: "x", value: { input: "drive" } },
                { op: "if", condition: { op: "gte", left: { input: "launch" }, right: 1 }, then: [
                  { op: "set", target: "x", value: 0 }
                ] }
              ]
            });
            game.onBeforeTick(() => portable.setInput("drive", -0.5));
            """;

        PortableProgram program = extract(source);
        assertEquals(2, program.version());
        PortableStateMachine machine = new PortableStateMachine(program);
        assertEquals(0.25, machine.input("drive"), 0.0001);
        machine.setInput("drive", -0.5);
        machine.tick();
        assertEquals(-0.5, machine.get("x"), 0.0001);
        machine.setInput("launch", 1);
        machine.tick();
        assertEquals(0.0, machine.get("x"), 0.0001);

        Path output = Files.createTempDirectory("mcgame-portable-v2-test");
        PortableDatapackCompiler.Result result = new PortableDatapackCompiler().compile(program, "portable_v2", output);
        assertEquals(3, result.inputCount());
        assertEquals(1, result.projectionCount());
        String load = Files.readString(output.resolve("data/portable_v2/function/portable/load.mcfunction"));
        assertTrue(load.contains("scoreboard players set #in_drive " + result.objective() + " 250"));
        assertTrue(load.contains("summon minecraft:block_display"));
        assertTrue(load.contains("minecraft:sea_lantern"));
        String tick = Files.readString(output.resolve("data/portable_v2/function/portable/tick.mcfunction"));
        assertTrue(tick.contains("#x " + result.objective() + " += #in_drive " + result.objective()));
        assertTrue(tick.contains("data get entity @s SelectedItemSlot 1000"));
        assertTrue(tick.contains("@a[gamemode=!spectator,limit=1,sort=arbitrary]"));
        assertTrue(tick.contains("Pos[0] double 0.001"));
        String marker = Files.readString(output.resolve(".mcgame-portable-generated"));
        assertTrue(marker.contains("portable_version=2"));
        assertTrue(marker.contains("input.drive=#in_drive"));
    }

    @Test
    void dslBuildsCurrentIrAndVanillaAdapters() throws Exception {
        String source = """
            portableDsl({ fixedPoint: 1000 }, game => {
              const x = game.state("x", 0);
              const vx = game.state("vx", 0.25);
              const slot = game.input("slot", 4, { source: "first_player_hotbar_slot" });

              game.block("probe", {
                block: "minecraft:sea_lantern",
                x: game.at(x, 10),
                y: 64,
                z: 0,
                scale: 0.5,
                translation: { x: -0.25, y: -0.25, z: -0.25 }
              });

              game.tick(() => {
                x.add(vx);
                game.when(slot.gte(6), () => vx.negate());
                game.when(x.gte(2), () => {
                  x.set(2);
                  vx.negate();
                });
              });
            });
            """;

        PortableProgram program = extract(source);
        assertEquals(9, program.version());
        assertEquals(2, program.initialState().size());
        assertEquals(1, program.initialInputs().size());
        assertEquals(1, program.vanillaProjections().size());
        assertEquals(3, program.tickActions().size());

        PortableStateMachine machine = new PortableStateMachine(program);
        machine.tick();
        assertEquals(0.25, machine.get("x"), 0.0001);
        machine.setInput("slot", 8);
        machine.tick();
        assertEquals(-0.25, machine.get("vx"), 0.0001);

        Path output = Files.createTempDirectory("mcgame-portable-dsl-test");
        PortableDatapackCompiler.Result result = new PortableDatapackCompiler().compile(program, "portable_dsl", output);
        assertEquals(1, result.inputCount());
        assertEquals(1, result.projectionCount());
        String tick = Files.readString(output.resolve("data/portable_dsl/function/portable/tick.mcfunction"));
        assertTrue(tick.contains("SelectedItemSlot 1000"));
        assertTrue(tick.contains("Pos[0] double 0.001"));
    }

    @Test
    void versionThreeDslCompilesHeldInputCameraAndParticles() throws Exception {
        String source = """
            portableDsl({ fixedPoint: 1000 }, game => {
              const x = game.state("x", 0);
              const burst = game.state("burst", 1);
              const left = game.input("left", 0, { source: "first_player_left" });
              const jump = game.input("jump", 0, { source: "first_player_jump" });

              game.camera("main", { x: 10, y: 70, z: -12, yaw: 0, pitch: 0 });
              game.particle("trail", {
                particle: "minecraft:end_rod",
                x: game.at(x, 10),
                y: 64,
                z: 0,
                delta: 0.1,
                speed: 0.02,
                count: 4,
                force: true,
                when: burst.eq(1)
              });

              game.tick(() => {
                game.when(left.eq(1), () => x.sub(0.2));
                game.when(jump.eq(1), () => burst.set(1));
              });
            });
            """;

        PortableProgram program = extract(source);
        assertEquals(9, program.version());
        assertEquals(2, program.initialInputs().size());
        assertEquals(1, program.vanillaCameras().size());
        assertEquals(1, program.vanillaParticles().size());
        assertEquals(PortableProgram.VanillaInputSource.FIRST_PLAYER_LEFT, program.vanillaInputs().get("left"));

        Path output = Files.createTempDirectory("mcgame-portable-v3-test");
        PortableDatapackCompiler.Result result = new PortableDatapackCompiler().compile(program, "portable_v3", output);
        assertEquals(1, result.cameraCount());
        assertEquals(1, result.particleCount());

        String leftPredicate = Files.readString(output.resolve("data/portable_v3/predicate/portable/input/left.json"));
        assertTrue(leftPredicate.contains("\"left\": true"));
        String jumpPredicate = Files.readString(output.resolve("data/portable_v3/predicate/portable/input/jump.json"));
        assertTrue(jumpPredicate.contains("\"jump\": true"));

        String load = Files.readString(output.resolve("data/portable_v3/function/portable/load.mcfunction"));
        assertTrue(load.contains("summon minecraft:armor_stand"));
        assertTrue(load.contains("summon minecraft:marker"));

        assertFalse(Files.exists(output.resolve("data/portable_v3/function/portable/camera_attach.mcfunction")));

        String tick = Files.readString(output.resolve("data/portable_v3/function/portable/tick.mcfunction"));
        assertTrue(tick.contains("run teleport @s @e[type=minecraft:armor_stand,tag=mcg_c_"));
        assertFalse(tick.contains("gamemode spectator"));
        assertFalse(tick.contains("spectate @e"));
        assertTrue(tick.contains("if predicate portable_v3:portable/input/left"));
        assertTrue(tick.contains("if predicate portable_v3:portable/input/jump"));
        assertTrue(tick.contains("particle minecraft:end_rod"));
        assertTrue(tick.contains("0.1 0.1 0.1 0.02 4 force"));
        assertTrue(tick.contains("Pos[0] double 0.001"));

        String cleanup = Files.readString(output.resolve("data/portable_v3/function/portable/cleanup.mcfunction"));
        assertFalse(cleanup.contains("spectate"));
        assertFalse(cleanup.contains("gamemode adventure"));
    }


    @Test
    void versionFourDslCompilesSoundTextHudAndAabbCollision() throws Exception {
        String source = """
            portableDsl({ fixedPoint: 1000 }, game => {
              const ax = game.state("ax", 0);
              const ay = game.state("ay", 0);
              const bx = game.state("bx", 0.75);
              const by = game.state("by", 0);
              const hit = game.state("hit", 0);
              const score = game.state("score", 3);
              const a = game.box("a", { x: ax, y: ay, width: 1, height: 1 });
              const b = game.box("b", { x: bx, y: by, width: 1, height: 1 });

              game.text("label", {
                text: "PORTABLE V4",
                x: game.at(ax, 10), y: 70, z: 0,
                scale: 0.75,
                billboard: "center"
              });
              game.sound("hit", {
                sound: "minecraft:block.note_block.pling",
                x: game.at(ax, 10), y: 70, z: 0,
                volume: 0.8, pitch: 1.4,
                when: hit.eq(1)
              });
              game.hud("main", { text: ["SCORE ", score] });
              game.tick(() => {
                hit.set(0);
                game.whenColliding(a, b, () => hit.set(1));
              });
            });
            """;

        PortableProgram program = extract(source);
        assertEquals(9, program.version());
        assertEquals(1, program.vanillaTexts().size());
        assertEquals(1, program.vanillaSounds().size());
        assertEquals(1, program.vanillaHuds().size());
        assertTrue(program.tickActions().stream().anyMatch(PortableProgram.AabbIfAction.class::isInstance));

        PortableStateMachine machine = new PortableStateMachine(program);
        machine.tick();
        assertEquals(1.0, machine.get("hit"), 0.0001);

        Path output = Files.createTempDirectory("mcgame-portable-v4-test");
        PortableDatapackCompiler.Result result = new PortableDatapackCompiler().compile(program, "portable_v4", output);
        assertEquals(1, result.textCount());
        assertEquals(1, result.soundCount());
        assertEquals(1, result.hudCount());

        String load = Files.readString(output.resolve("data/portable_v4/function/portable/load.mcfunction"));
        assertTrue(load.contains("summon minecraft:text_display"));
        assertTrue(load.contains("text:{text:\"PORTABLE V4\"}"));
        assertFalse(load.contains("text:\"{\\\"text\\\":\\\"PORTABLE V4\\\"}\""));
        assertTrue(load.contains("summon minecraft:marker"));

        String tick = Files.readString(output.resolve("data/portable_v4/function/portable/tick.mcfunction"));
        assertTrue(tick.contains("playsound minecraft:block.note_block.pling master @a"));
        assertTrue(tick.contains("title @s actionbar"));
        assertTrue(tick.contains("SCORE "));
        assertTrue(tick.contains(" /= "));
        assertTrue(tick.contains(" if score #q"));
        assertTrue(tick.contains(" <= #q"));

        String cleanup = Files.readString(output.resolve("data/portable_v4/function/portable/cleanup.mcfunction"));
        assertTrue(cleanup.contains("title @s actionbar"));
        assertTrue(cleanup.contains("kill @e[tag=mcg_t_"));
    }

    @Test
    void versionFiveDslCompilesRepeatVisibilityAndCircleCollision() throws Exception {
        String source = """
            portableDsl({ fixedPoint: 1000 }, game => {
              const x = game.state("x", 0);
              const y = game.state("y", 0);
              const hit = game.state("hit", 0);
              const visible = game.state("visible", 1);
              const ball = game.circle("ball", { x, y, radius: 0.25 });
              const bumper = game.circle("bumper", { x: 0.4, y: 0, radius: 0.25 });

              const bricks = game.repeat(3, i => {
                const alive = game.state("brick" + i, 1);
                game.block("brick" + i, {
                  block: "minecraft:red_concrete",
                  x: 10 + i,
                  y: 64,
                  z: 0,
                  scale: { x: 0.9, y: 0.4, z: 0.2 },
                  when: alive.eq(1)
                });
                return alive;
              });

              game.text("label", {
                text: "VISIBLE",
                x: 10, y: 66, z: 0,
                when: visible.eq(1)
              });

              game.tick(() => {
                hit.set(0);
                game.whenColliding(ball, bumper, () => hit.set(1));
                game.when(hit.eq(1), () => bricks[0].set(0));
              });
            });
            """;

        PortableProgram program = extract(source);
        assertEquals(9, program.version());
        assertEquals(3, program.vanillaProjections().size());
        assertEquals(1, program.vanillaTexts().size());
        assertTrue(program.tickActions().stream().anyMatch(PortableProgram.CircleIfAction.class::isInstance));
        assertTrue(program.vanillaProjections().stream().allMatch(p -> p.condition() != null));
        assertTrue(program.vanillaTexts().getFirst().condition() != null);

        PortableStateMachine machine = new PortableStateMachine(program);
        machine.tick();
        assertEquals(1.0, machine.get("hit"), 0.0001);
        assertEquals(0.0, machine.get("brick0"), 0.0001);

        Path output = Files.createTempDirectory("mcgame-portable-v5-test");
        PortableDatapackCompiler.Result result = new PortableDatapackCompiler().compile(program, "portable_v5", output);
        assertEquals(3, result.projectionCount());
        String load = Files.readString(output.resolve("data/portable_v5/function/portable/load.mcfunction"));
        String tick = Files.readString(output.resolve("data/portable_v5/function/portable/tick.mcfunction"));
        assertTrue(load.contains("transformation.scale set value"));
        assertTrue(tick.contains("transformation.scale set value [0f,0f,0f]"));
        assertTrue(tick.contains(" *= #q"));
        assertTrue(tick.contains(" <= #c"));
    }

    @Test
    void versionSixDslCompilesSegmentTriggerAndFlipper() throws Exception {
        String source = """
            portableDsl({ fixedPoint: 1000 }, game => {
              const x = game.state("x", 0);
              const y = game.state("y", 0.15);
              const active = game.state("active", 1);
              const wallHit = game.state("wallHit", 0);
              const triggerHit = game.state("triggerHit", 0);
              const flipperHit = game.state("flipperHit", 0);
              const wallMiss = game.state("wallMiss", 0);
              const triggerMiss = game.state("triggerMiss", 0);
              const ball = game.circle("ball", { x, y, radius: 0.2 });
              const farBall = game.circle("farBall", { x: 0, y: 3, radius: 0.2 });
              const wall = game.segment("wall", { ax: -1, ay: 0, bx: 1, by: 0 });
              const drain = game.trigger("drain", { x: 0, y: 0, width: 2, height: 1 });
              const flipper = game.flipper("left", {
                pivotX: -1, pivotY: -1, length: 2, radius: 0.15,
                restAngle: 0, activeAngle: 45, activeWhen: active.eq(1)
              });

              game.tick(() => {
                wallHit.set(0);
                triggerHit.set(0);
                flipperHit.set(0);
                game.whenColliding(ball, wall, () => wallHit.set(1));
                game.whenColliding(farBall, wall, () => wallMiss.set(1));
                game.whenTriggered(drain, ball, () => triggerHit.set(1));
                game.whenTriggered(drain, farBall, () => triggerMiss.set(1));
                game.whenColliding(ball, flipper, () => flipperHit.set(1));
              });
            });
            """;

        PortableProgram program = extract(source);
        assertEquals(9, program.version());
        assertTrue(program.tickActions().stream().anyMatch(PortableProgram.CircleCapsuleIfAction.class::isInstance));
        assertTrue(program.tickActions().stream().anyMatch(PortableProgram.TriggerIfAction.class::isInstance));

        PortableStateMachine machine = new PortableStateMachine(program);
        machine.tick();
        assertEquals(1.0, machine.get("wallHit"), 0.0001);
        assertEquals(0.0, machine.get("wallMiss"), 0.0001);
        assertEquals(1.0, machine.get("triggerHit"), 0.0001);
        assertEquals(0.0, machine.get("triggerMiss"), 0.0001);
        assertEquals(1.0, machine.get("flipperHit"), 0.0001);

        Path output = Files.createTempDirectory("mcgame-portable-v6-test");
        new PortableDatapackCompiler().compile(program, "portable_v6", output);
        StringBuilder functions = new StringBuilder();
        try (var paths = Files.walk(output.resolve("data/portable_v6/function/portable"))) {
            for (Path path : paths.filter(Files::isRegularFile).toList()) functions.append(Files.readString(path));
        }
        String generated = functions.toString();
        assertTrue(generated.contains("matches ..0 if score"));
        assertTrue(generated.contains("matches 1.. if score"));
        assertTrue(generated.contains("run scoreboard players set #q"));
    }

    @Test
    void versionSevenDslCompilesBoundedActorProjections() throws Exception {
        String source = """
            portableDsl({ fixedPoint: 1000 }, game => {
              const x = game.state("x", 0);
              const z = game.state("z", 0);
              const yaw = game.state("yaw", 0);
              const alive = game.state("alive", 1);
              const hp = game.state("hp", 12);

              game.actor("hero", {
                x: game.at(x, 10), y: 64, z: game.at(z, 5), yaw
              });
              game.actor("enemy", {
                entityType: "minecraft:zombie",
                x: 12, y: 64, z: 5, yaw: 180, when: alive.eq(1)
              });
              game.text("enemy_label", {
                text: ["HP ", hp], x: 12, y: 66, z: 5, billboard: "center"
              });

              game.tick(() => {
                x.add(0.1);
                yaw.add(15);
                game.when(x.gte(1), () => alive.set(0));
              });
            });
            """;

        PortableProgram program = extract(source);
        assertEquals(9, program.version());
        assertEquals(2, program.vanillaActors().size());
        assertEquals("minecraft:mannequin", program.vanillaActors().get(0).entityType());
        assertEquals("minecraft:zombie", program.vanillaActors().get(1).entityType());
        assertTrue(program.vanillaActors().get(0).x().dynamic());
        assertTrue(program.vanillaActors().get(0).yaw().dynamic());
        assertTrue(program.vanillaActors().get(1).condition() != null);
        assertEquals(1, program.vanillaTexts().size());
        assertTrue(program.vanillaTexts().getFirst().dynamicText());

        Path output = Files.createTempDirectory("mcgame-portable-v7-actor-test");
        PortableDatapackCompiler.Result result = new PortableDatapackCompiler().compile(program, "portable_v7_actor", output);
        assertEquals(2, result.actorCount());
        assertEquals(1, result.textCount());
        String load = Files.readString(output.resolve("data/portable_v7_actor/function/portable/load.mcfunction"));
        String tick = Files.readString(output.resolve("data/portable_v7_actor/function/portable/tick.mcfunction"));
        String enemySpawn = Files.readString(output.resolve("data/portable_v7_actor/function/portable/actor_enemy_spawn.mcfunction"));
        String cleanup = Files.readString(output.resolve("data/portable_v7_actor/function/portable/cleanup.mcfunction"));
        assertTrue(load.contains("actor_hero_spawn"));
        assertTrue(load.contains("actor_enemy_spawn"));
        assertTrue(enemySpawn.contains("summon minecraft:mannequin"));
        assertTrue(enemySpawn.contains("armor.head with minecraft:zombie_head"));
        assertTrue(tick.contains("Rotation[0] float 0.001"));
        assertTrue(tick.contains("unless entity @e[tag=mcg_a_"));
        assertTrue(tick.contains("run kill @e[tag=mcg_a_"));
        assertTrue(tick.contains("data modify entity @e[tag=mcg_t_"));
        assertTrue(tick.contains(" text set value {text:\"\",extra:["));
        assertTrue(tick.contains("score:{name:"));
        assertTrue(cleanup.contains("kill @e[tag=mcg_a_"));
    }

    @Test
    void versionEightDslCompilesBoundedWorldProjection() throws Exception {
        String source = """
            portableDsl({ fixedPoint: 1000 }, game => {
              const mode = game.state("mode", 0);
              const left = game.input("left", 0, { source: "first_player_left" });

              game.worldBatch("base", {
                blocks: [
                  { x: 160, y: 90, z: 0, block: "minecraft:stone" },
                  { x: 161, y: 90, z: 0, block: "minecraft:deepslate_tiles" }
                ]
              });
              game.worldFill("paint", {
                fromX: 160, fromY: 91, fromZ: 0,
                toX: 161, toY: 91, toZ: 1,
                block: "minecraft:gold_block",
                when: left.eq(1)
              });

              game.tick(() => { mode.set(1); });
            });
            """;

        PortableProgram program = extract(source);
        assertEquals(9, program.version());
        assertEquals(2, program.vanillaWorldBatches().size());
        assertEquals(2, program.vanillaWorldBatches().get(0).blocks().size());
        assertEquals(4, program.vanillaWorldBatches().get(1).blocks().size());
        assertEquals(null, program.vanillaWorldBatches().get(0).condition());
        assertTrue(program.vanillaWorldBatches().get(1).condition() != null);

        Path output = Files.createTempDirectory("mcgame-portable-v8-world-test");
        PortableDatapackCompiler.Result result = new PortableDatapackCompiler().compile(program, "portable_v8_world", output);
        assertEquals(2, result.worldBatchCount());
        String load = Files.readString(output.resolve("data/portable_v8_world/function/portable/load.mcfunction"));
        String tick = Files.readString(output.resolve("data/portable_v8_world/function/portable/tick.mcfunction"));
        String base = Files.readString(output.resolve("data/portable_v8_world/function/portable/world_base.mcfunction"));
        String paint = Files.readString(output.resolve("data/portable_v8_world/function/portable/world_paint.mcfunction"));
        String cleanup = Files.readString(output.resolve("data/portable_v8_world/function/portable/cleanup.mcfunction"));
        assertTrue(load.contains("function portable_v8_world:portable/world_base"));
        assertFalse(load.contains("world_paint"));
        assertTrue(tick.contains("run function portable_v8_world:portable/world_paint"));
        assertTrue(base.contains("forceload add 160 0"));
        assertTrue(base.contains("setblock 160 90 0 minecraft:stone"));
        assertTrue(base.contains("setblock 161 90 0 minecraft:deepslate_tiles"));
        assertTrue(base.contains("forceload remove 160 0"));
        assertEquals(4, paint.lines().filter(line -> line.contains(" setblock " )).count());
        assertFalse(cleanup.contains("setblock"));
        assertFalse(cleanup.contains("world_base"));
    }

    @Test
    void versionNineDslCompilesSidebarAndInputEdgeState() throws Exception {
        String source = """
            portableDsl({ fixedPoint: 1000 }, game => {
              const selection = game.state("selection", 0);
              const confirms = game.state("confirms", 0);
              const jumpPrev = game.state("jump_prev", 0);
              const jump = game.input("jump", 0, { source: "first_player_jump" });

              game.sidebar("main", {
                title: "Portable UI",
                rows: [
                  { id: "selection", text: ["SELECT ", selection] },
                  { id: "confirms", text: ["CONFIRMS ", confirms] },
                  { id: "help", text: "SPACE CONFIRM" }
                ]
              });
              game.tick(() => {
                game.when(jump.eq(1), () => {
                  game.when(jumpPrev.eq(0), () => confirms.add(1));
                });
                jumpPrev.set(jump);
                selection.set(1);
              });
            });
            """;

        PortableProgram program = extract(source);
        assertEquals(9, program.version());
        assertEquals(1, program.vanillaSidebars().size());
        assertEquals(3, program.vanillaSidebars().getFirst().rows().size());

        PortableStateMachine machine = new PortableStateMachine(program);
        machine.setInput("jump", 1);
        machine.tick();
        assertEquals(1.0, machine.get("confirms"), 0.0001);
        machine.tick();
        assertEquals(1.0, machine.get("confirms"), 0.0001);
        machine.setInput("jump", 0);
        machine.tick();
        machine.setInput("jump", 1);
        machine.tick();
        assertEquals(2.0, machine.get("confirms"), 0.0001);

        Path output = Files.createTempDirectory("mcgame-portable-v9-sidebar-test");
        PortableDatapackCompiler.Result result = new PortableDatapackCompiler().compile(program, "portable_v9_ui", output);
        assertEquals(1, result.sidebarCount());
        String load = Files.readString(output.resolve("data/portable_v9_ui/function/portable/load.mcfunction"));
        String tick = Files.readString(output.resolve("data/portable_v9_ui/function/portable/tick.mcfunction"));
        String cleanup = Files.readString(output.resolve("data/portable_v9_ui/function/portable/cleanup.mcfunction"));
        assertTrue(load.contains("scoreboard objectives add mcgu"));
        assertTrue(load.contains("scoreboard players display numberformat r00"));
        assertTrue(load.contains("scoreboard objectives setdisplay sidebar mcgu"));
        assertTrue(tick.contains("scoreboard players display name r00 mcgu"));
        assertTrue(tick.contains("SELECT "));
        assertTrue(tick.contains("\"score\":{\"name\""));
        assertTrue(cleanup.contains("scoreboard objectives remove mcgu"));
    }

    @Test
    void versionTenOwnershipStagesOwnedEntitiesAndAvoidsPersistentPlayerCameraState() throws Exception {
        String source = """
            portableDsl({
              fixedPoint: 1000,
              ownership: { minX: 32, minZ: -16, maxX: 48, maxZ: 16 }
            }, game => {
              const x = game.state("x", 0);
              const left = game.input("left", 0, { source: "first_player_left" });
              game.block("mover", {
                block: "minecraft:sea_lantern",
                x: game.at(x, 40), y: 80, z: 0
              });
              game.camera("main", { x: 40, y: 84, z: -12, yaw: 0, pitch: 10 });
              game.tick(() => {
                game.when(left.eq(1), () => x.sub(40));
              });
            });
            """;

        PortableProgram program = extract(source);
        assertEquals(10, program.version());
        assertTrue(program.vanillaOwnership() != null);
        assertEquals(32, program.vanillaOwnership().minX());

        Path output = Files.createTempDirectory("mcgame-portable-v10-ownership-test");
        new PortableDatapackCompiler().compile(program, "portable_v10_life", output);
        String load = Files.readString(output.resolve("data/portable_v10_life/function/portable/load.mcfunction"));
        String init = Files.readString(output.resolve("data/portable_v10_life/function/portable/owned_init.mcfunction"));
        String tick = Files.readString(output.resolve("data/portable_v10_life/function/portable/tick.mcfunction"));
        String cleanup = Files.readString(output.resolve("data/portable_v10_life/function/portable/cleanup.mcfunction"));

        assertTrue(load.contains("forceload add 32 -16 48 16"));
        assertTrue(load.contains("schedule function portable_v10_life:portable/owned_init 2t replace"));
        assertTrue(init.contains("kill @e[tag=mcg_o_"));
        assertTrue(init.contains("summon minecraft:block_display"));
        assertTrue(init.contains("scoreboard players set #ready"));
        assertTrue(tick.startsWith("execute unless score #ready"));
        assertTrue(tick.contains("run teleport @s @e[type=minecraft:armor_stand"));
        assertTrue(tick.contains("matches" ) || tick.contains("scoreboard players operation"));
        assertFalse(tick.contains("gamemode spectator"));
        assertFalse(tick.contains("spectate"));
        assertTrue(cleanup.contains("kill @e[tag=mcg_o_"));
        assertTrue(cleanup.contains("forceload remove 32 -16 48 16"));
        assertFalse(cleanup.contains("gamemode adventure"));
    }

    @Test
    void versionEightRejectsSidebarMetadata() {
        String source = """
            portable.define({
              version: 8,
              fixedPoint: 1000,
              state: { x: 0 },
              vanilla: {
                sidebars: [{
                  id: "main", title: "UI",
                  rows: [{ id: "x", tokens: [{ text: "X" }] }]
                }]
              },
              tick: []
            });
            """;
        RuntimeException error = assertThrows(RuntimeException.class, () -> extract(source));
        assertTrue(error.getMessage().contains("vanilla.sidebars requires portable version 9"));
    }

    @Test
    void versionSevenRejectsWorldBatchMetadata() {
        String source = """
            portable.define({
              version: 7,
              fixedPoint: 1000,
              state: { x: 0 },
              vanilla: {
                worldBatches: [{
                  id: "base",
                  blocks: [{ x: 0, y: 64, z: 0, block: "minecraft:stone" }]
                }]
              },
              tick: []
            });
            """;
        RuntimeException error = assertThrows(RuntimeException.class, () -> extract(source));
        assertTrue(error.getMessage().contains("vanilla.worldBatches requires portable version 8"));
    }

    @Test
    void versionEightRejectsOversizedWorldFill() {
        String source = """
            portableDsl({ fixedPoint: 1000 }, game => {
              game.state("ready", 1);
              game.worldFill("too_big", {
                fromX: 0, fromY: 0, fromZ: 0,
                toX: 32, toY: 30, toZ: 32,
                block: "minecraft:stone"
              });
              game.tick(() => {});
            });
            """;
        RuntimeException error = assertThrows(RuntimeException.class, () -> extract(source));
        assertTrue(error.getMessage().contains("worldFill too_big exceeds 32768 writes"));
    }

    @Test
    void versionSixRejectsDynamicTextTokens() {
        String source = """
            portable.define({
              version: 6,
              fixedPoint: 1000,
              state: { hp: 12 },
              vanilla: {
                texts: [{
                  id: "hp", text: [{ text: "HP " }, { value: { state: "hp" } }],
                  x: 0, y: 64, z: 0
                }]
              },
              tick: []
            });
            """;
        RuntimeException error = assertThrows(RuntimeException.class, () -> extract(source));
        assertTrue(error.getMessage().contains("text token arrays require portable version 7"));
    }

    @Test
    void versionSixRejectsActorProjectionMetadata() {
        String source = """
            portable.define({
              version: 6,
              fixedPoint: 1000,
              state: { x: 0 },
              vanilla: {
                actors: [{ id: "hero", x: 0, y: 64, z: 0 }]
              },
              tick: []
            });
            """;
        RuntimeException error = assertThrows(RuntimeException.class, () -> extract(source));
        assertTrue(error.getMessage().contains("vanilla.actors requires portable version 7"));
    }

    @Test
    void versionFiveRejectsVersionSixCollisionActions() {
        String source = """
            portable.define({
              version: 5,
              fixedPoint: 1000,
              state: { x: 0, y: 0 },
              tick: [{
                op: "if_circle_capsule",
                circle: { x: { state: "x" }, y: { state: "y" }, radius: 0.2 },
                capsule: { ax: -1, ay: 0, bx: 1, by: 0, radius: 0.1 },
                then: []
              }]
            });
            """;
        RuntimeException error = assertThrows(RuntimeException.class, () -> extract(source));
        assertTrue(error.getMessage().contains("requires portable version 6"));
    }

    @Test
    void versionTwoRejectsHeldPlayerInput() {
        String source = """
            portable.define({
              version: 2,
              state: { x: 0 },
              inputs: { left: 0 },
              vanilla: { inputs: { left: { source: "first_player_left" } } },
              tick: []
            });
            """;
        RuntimeException error = assertThrows(RuntimeException.class, () -> extract(source));
        assertTrue(error.getMessage().contains("requires portable version 3"));
    }

    @Test
    void versionOneRejectsInputRegisters() {
        String source = "portable.define({ version: 1, state: { x: 0 }, inputs: { drive: 0 }, tick: [] });";
        RuntimeException error = assertThrows(RuntimeException.class, () -> extract(source));
        assertTrue(error.getMessage().contains("inputs requires portable version 2"));
    }

    @Test
    void extractorRejectsLiveHostDependenciesAtTopLevel() {
        String javascript = "input.players(); portable.define({ state: { x: 0 }, tick: [] });";
        RuntimeException error = assertThrows(RuntimeException.class,
            () -> PortableProgramExtractor.extract("host-dependent.js", javascript));
        assertTrue(error.getMessage().contains("input.players"));
    }

    private static PortableProgram extract(String source) {
        String javascript;
        try (TsCompiler compiler = new TsCompiler(LoggerFactory.getLogger("portable-test"))) {
            javascript = compiler.transpile("portable-test.ts", source);
        }
        return PortableProgramExtractor.extract("portable-test.ts", javascript);
    }
}
