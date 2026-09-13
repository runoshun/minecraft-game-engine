import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { compileDatapack } from "../compiler.mjs";
import { extractPortableSpec, transpileTypeScript } from "../extract.mjs";
import { parseProgram } from "../program.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

function extract(source) {
  const js = transpileTypeScript("test.ts", source, root);
  return parseProgram(extractPortableSpec("test.ts", js, root));
}

function compileSource(source, namespace = "portable_test") {
  const program = extract(source);
  const output = fs.mkdtempSync(path.join(os.tmpdir(), "mcgame-node-compiler-"));
  const result = compileDatapack(program, namespace, output);
  return { program, output, result };
}

function read(output, relative) { return fs.readFileSync(path.join(output, relative), "utf8"); }

test("v1 fixed-point arithmetic emits deterministic scoreboard functions", () => {
  const { program, output, result } = compileSource(`
    portable.define({
      version: 1,
      fixedPoint: 1000,
      state: { x: 1, y: -2 },
      tick: [
        { op: "add", target: "x", value: 0.5 },
        { op: "if", condition: { op: "gt", left: { state: "x" }, right: 1 }, then: [
          { op: "sub", target: "y", value: { state: "x" } }
        ] }
      ]
    });
  `);
  assert.equal(program.version, 1);
  assert.equal(result.stateCount, 2);
  assert.match(read(output, "data/portable_test/function/portable/load.mcfunction"), /scoreboard players set #x .* 1000/);
  assert.match(read(output, "data/portable_test/function/portable/tick.mcfunction"), /function portable_test:portable\/branch_000/);
});

test("v11 spectate camera never owns gamemode", () => {
  const { program, output } = compileSource(`
    portableDsl({ fixedPoint: 1000 }, game => {
      const x = game.state("x", 0);
      const left = game.input("left", 0, { source: "first_player_left" });
      game.camera("main", { x: 20, y: 80, z: -20, yaw: 15, pitch: 10, mode: "spectate" });
      game.tick(() => game.when(left.eq(1), () => x.sub(1)));
    });
  `, "portable_v11_camera");
  assert.equal(program.version, 11);
  const tick = read(output, "data/portable_v11_camera/function/portable/tick.mcfunction");
  const cleanup = read(output, "data/portable_v11_camera/function/portable/cleanup.mcfunction");
  assert.match(tick, /@a\[gamemode=spectator,limit=1,sort=arbitrary\]/);
  assert.match(tick, /run spectate @e\[type=minecraft:armor_stand/);
  assert.doesNotMatch(tick, /gamemode spectator|gamemode adventure/);
  assert.doesNotMatch(cleanup, /gamemode spectator|gamemode adventure/);
});

test("ownership lifecycle is staged and cleanup removes owned resources", () => {
  const { output } = compileSource(`
    portableDsl({ fixedPoint: 1000, ownership: { minX: 32, minZ: -16, maxX: 48, maxZ: 16 } }, game => {
      const x = game.state("x", 0);
      game.block("mover", { block: "minecraft:sea_lantern", x: game.at(x, 40), y: 80, z: 0 });
      game.camera("main", { x: 40, y: 84, z: -12, yaw: 0, pitch: 10 });
      game.tick(() => {});
    });
  `, "portable_v10_life");
  const load = read(output, "data/portable_v10_life/function/portable/load.mcfunction");
  const tick = read(output, "data/portable_v10_life/function/portable/tick.mcfunction");
  const cleanup = read(output, "data/portable_v10_life/function/portable/cleanup.mcfunction");
  assert.match(load, /forceload add 32 -16 48 16/);
  assert.match(load, /schedule function portable_v10_life:portable\/owned_init 2t replace/);
  assert.match(tick, /^execute unless score #ready/);
  assert.match(cleanup, /schedule clear portable_v10_life:portable\/owned_init/);
  assert.match(cleanup, /forceload remove 32 -16 48 16/);
});

test("extractor rejects live host dependencies", () => {
  const js = transpileTypeScript("host.ts", `input.players(); portable.define({ state: { x: 0 }, tick: [] });`, root);
  assert.throws(() => extractPortableSpec("host.ts", js, root), /input\.players/);
});

test("v12 is rejected until the multiplayer implementation phase", () => {
  assert.throws(() => extract(`portable.define({ version: 12, state: { x: 0 }, tick: [] });`), /must be between 1 and 11/);
});

test("representative checked-in examples compile deterministically", () => {
  const cases = [
    ["examples/portable-bounce/datapack/data/portable_bounce/mcgame/main.ts", "portable_bounce", 1],
    ["examples/portable-pinball-core/datapack/data/portable_pinball/mcgame/main.ts", "portable_pinball", 10],
    ["examples/portable-breakout-core/datapack/data/portable_breakout/mcgame/main.ts", "portable_breakout", 10],
    ["examples/portable-presentation-core/datapack/data/portable_presentation/mcgame/main.ts", "portable_presentation", 10],
    ["examples/portable-ui-core/datapack/data/portable_ui/mcgame/main.ts", "portable_ui", 9],
    ["examples/portable-world-core/datapack/data/portable_world/mcgame/main.ts", "portable_world", 10],
    ["examples/jrpg-demo/datapack/data/jrpg_demo/mcgame/main.ts", "jrpg_demo", 10],
  ];
  for (const [relative, namespace, expectedVersion] of cases) {
    const source = fs.readFileSync(path.join(root, relative), "utf8");
    const program = parseProgram(extractPortableSpec(relative, transpileTypeScript(relative, source, root), root));
    assert.equal(program.version, expectedVersion, relative);
    const a = fs.mkdtempSync(path.join(os.tmpdir(), "mcgame-a-"));
    const b = fs.mkdtempSync(path.join(os.tmpdir(), "mcgame-b-"));
    compileDatapack(program, namespace, a);
    compileDatapack(program, namespace, b);
    const files = dir => fs.readdirSync(dir, { recursive: true, withFileTypes: true })
      .filter(entry => entry.isFile()).map(entry => path.join(entry.parentPath ?? entry.path, entry.name).slice(dir.length + 1)).sort();
    assert.deepEqual(files(a), files(b), relative);
    for (const file of files(a)) assert.equal(read(a, file), read(b, file), `${relative}: ${file}`);
  }
});
