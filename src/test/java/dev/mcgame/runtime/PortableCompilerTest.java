package dev.mcgame.runtime;

import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertEquals;
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
        assertEquals(3, program.version());
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
        assertEquals(3, program.version());
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

        String attach = Files.readString(output.resolve("data/portable_v3/function/portable/camera_attach.mcfunction"));
        assertTrue(attach.contains("gamemode spectator @s"));
        assertTrue(attach.contains("spectate @e[type=minecraft:armor_stand"));

        String tick = Files.readString(output.resolve("data/portable_v3/function/portable/tick.mcfunction"));
        assertTrue(tick.contains("if score #enabled " + result.objective() + " matches 1"));
        assertTrue(tick.contains("if predicate portable_v3:portable/input/left"));
        assertTrue(tick.contains("if predicate portable_v3:portable/input/jump"));
        assertTrue(tick.contains("particle minecraft:end_rod"));
        assertTrue(tick.contains("0.1 0.1 0.1 0.02 4 force"));
        assertTrue(tick.contains("Pos[0] double 0.001"));

        String cleanup = Files.readString(output.resolve("data/portable_v3/function/portable/cleanup.mcfunction"));
        assertTrue(cleanup.contains("run spectate"));
        assertTrue(cleanup.contains("gamemode adventure"));
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
