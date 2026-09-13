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

test("v12 player context lowers player-local state input HUD and camera audience", () => {
  const { program, output, result } = compileSource(`
    portableDsl({ fixedPoint: 1000, ownership: { minX: 0, minZ: 0, maxX: 16, maxZ: 16 } }, game => {
      const round = game.state("round", 1);
      const players = game.players();
      game.camera("main", { x: 8, y: 80, z: 8, yaw: 0, pitch: 10, mode: "spectate", audience: players });
      game.tick(() => {
        game.forEachPlayer(players, player => {
          const hp = player.state("hp", 20);
          const jumpPrev = player.state("jumpPrev", 0);
          game.when(player.input.left.eq(1), () => hp.sub(1));
          game.when(player.input.jump.eq(1), () => hp.add(round));
          game.when(player.input.hotbarSlot.eq(2), () => hp.add(1));
          jumpPrev.set(player.input.jump);
          player.hud("status", { text: ["HP ", hp, " R ", round] });
        });
      });
    });
  `, "portable_v12_multi");

  assert.equal(program.version, 12);
  assert.equal(result.playerStateCount, 2);
  assert.equal(result.playerInputCount, 3);
  assert.equal(result.playerHudCount, 1);
  assert.deepEqual([...program.playerInputs].sort(), ["hotbarSlot", "jump", "left"]);

  const load = read(output, "data/portable_v12_multi/function/portable/load.mcfunction");
  const tick = read(output, "data/portable_v12_multi/function/portable/tick.mcfunction");
  const init = read(output, "data/portable_v12_multi/function/portable/player_init.mcfunction");
  const player = read(output, "data/portable_v12_multi/function/portable/player_000.mcfunction");
  const cleanup = read(output, "data/portable_v12_multi/function/portable/cleanup.mcfunction");
  const marker = read(output, ".mcgame-portable-generated");

  assert.match(load, /scoreboard objectives remove mpz[0-9a-f]{8}/);
  assert.match(load, /scoreboard objectives add mps[0-9a-f]{8}00 dummy/);
  assert.match(load, /scoreboard objectives add mpi[0-9a-f]{8}03 dummy/);
  assert.match(load, /scoreboard objectives add mph[0-9a-f]{8}00 dummy/);
  assert.match(init, /scoreboard players set @s mps[0-9a-f]{8}00 20000/);
  assert.match(init, /scoreboard players set @s mpz[0-9a-f]{8} 1/);
  assert.match(tick, /data get entity @s SelectedItemSlot 1000/);

  const initAt = tick.indexOf("unless score @s mpz");
  const inputAt = tick.indexOf("predicate portable_v12_multi:portable/input/left");
  const rulesAt = tick.indexOf("execute as @a run function portable_v12_multi:portable/player_000");
  const cameraAt = tick.indexOf("execute as @a[gamemode=spectator]");
  const hudAt = tick.indexOf("run title @s actionbar");
  assert.ok(initAt >= 0 && inputAt > initAt && rulesAt > inputAt && cameraAt > rulesAt && hudAt > cameraAt);
  assert.doesNotMatch(tick, /gamemode=spectator,limit=1/);
  assert.match(player, /scoreboard players operation @s mps[0-9a-f]{8}01 = @s mpi[0-9a-f]{8}05/);
  assert.match(cleanup, /title @a actionbar/);
  assert.match(cleanup, /scoreboard objectives remove mps[0-9a-f]{8}0v/);
  assert.match(cleanup, /scoreboard objectives remove mpi[0-9a-f]{8}07/);
  assert.match(cleanup, /scoreboard objectives remove mph[0-9a-f]{8}0v/);
  assert.match(marker, /portable_version=12/);
  assert.match(marker, /player\.state\.hp=mps[0-9a-f]{8}00/);

  const objectiveNames = [...load.matchAll(/scoreboard objectives (?:add|remove) (\S+)/g)].map(match => match[1]);
  assert.ok(objectiveNames.every(name => name.length <= 16));
});

test("v12 rejects shared mutation and nested player contexts", () => {
  assert.throws(() => extract(`
    portableDsl(game => {
      const shared = game.state("shared", 0);
      const players = game.players();
      game.tick(() => game.forEachPlayer(players, player => shared.add(1)));
    });
  `), /shared state mutation is not allowed inside PlayerContext/);

  assert.throws(() => extract(`
    portableDsl(game => {
      game.state("shared", 0);
      const players = game.players();
      game.tick(() => game.forEachPlayer(players, player => game.forEachPlayer(players, other => {})));
    });
  `), /nested PlayerContext is not supported/);
});

test("v12 rejects escaped player-local references and oversized player-state banks", () => {
  assert.throws(() => extract(`
    portableDsl(game => {
      game.state("shared", 0);
      const players = game.players();
      let escaped;
      game.tick(() => {
        game.forEachPlayer(players, player => { escaped = player.state("hp", 20); });
        game.when(escaped.eq(20), () => {});
      });
    });
  `), /escaped its PlayerContext/);

  const playerState = Object.fromEntries(Array.from({ length: 33 }, (_, index) => [`s${index}`, 0]));
  assert.throws(() => parseProgram({ version: 12, state: {}, playerState, tick: [] }), /exceeds max player-state count 32/);
});

test("v12 parser rejects escaped player writes and legacy shared input", () => {
  assert.throws(() => extract(`
    portable.define({
      version: 12,
      state: { shared: 0 },
      playerState: { hp: 20 },
      tick: [{ op: "for_each_player", players: "all_online", actions: [
        { op: "add", target: "shared", value: 1 }
      ] }]
    });
  `), /shared state mutation is not allowed inside PlayerContext/);

  assert.throws(() => extract(`
    portable.define({ version: 12, state: { shared: 0 }, inputs: { left: 0 }, tick: [] });
  `), /inputs is v1-v11 compatibility only/);
});

test("v13 grid RNG projection and singleton player scope lower to bounded vanilla functions", () => {
  const { program, output, result } = compileSource(`
    portableDsl({ fixedPoint: 1000 }, game => {
      const x = game.state("x", 1);
      const z = game.state("z", 1);
      const cell = game.state("cell", 0);
      const roll = game.state("roll", 0);
      const dungeon = game.grid("dungeon", { width: 4, height: 3, initial: 0, outside: -1 });
      const rng = game.rng("dungeon_rng", { seed: 12345 });
      const terrain = game.gridWorld("terrain", {
        grid: dungeon,
        originX: 20, y: 80, originZ: 30,
        palette: [
          { value: 0, block: "minecraft:black_concrete" },
          { value: 1, block: "minecraft:white_concrete" },
          { value: 2, block: "minecraft:lime_concrete" },
        ],
        cellsPerTick: 5,
      });
      const players = game.players();
      game.tick(() => {
        game.forSinglePlayer(players, player => {
          game.when(player.input.left.eq(1), () => x.sub(1));
          dungeon.get(x, z, cell);
          game.when(player.input.jump.eq(1), () => {
            rng.int(roll, 1, 2);
            dungeon.set(x, z, roll);
            dungeon.fillRect({ x: 0, z: 0, width: 2, height: 2, value: 1 });
            terrain.rebuild();
          });
        });
        game.when(terrain.ready.eq(1), () => cell.add(0));
      });
    });
  `, "portable_v13_grid");

  assert.equal(program.version, 13);
  assert.equal(result.gridCount, 1);
  assert.equal(result.rngCount, 1);
  assert.equal(result.gridWorldCount, 1);
  assert.equal(program.grids[0].width, 4);
  assert.equal(program.grids[0].height, 3);
  assert.equal(program.grids[0].outsideRaw, -1000);

  const load = read(output, "data/portable_v13_grid/function/portable/load.mcfunction");
  const tick = read(output, "data/portable_v13_grid/function/portable/tick.mcfunction");
  const player = read(output, "data/portable_v13_grid/function/portable/player_000.mcfunction");
  const getMacro = read(output, "data/portable_v13_grid/function/portable/grid_dungeon_get_macro.mcfunction");
  const setMacro = read(output, "data/portable_v13_grid/function/portable/grid_dungeon_set_macro.mcfunction");
  const rect = read(output, "data/portable_v13_grid/function/portable/grid_dungeon_rect_prepare.mcfunction");
  const jumpBranch = read(output, "data/portable_v13_grid/function/portable/branch_001.mcfunction");
  const cleanup = read(output, "data/portable_v13_grid/function/portable/cleanup.mcfunction");
  const marker = read(output, ".mcgame-portable-generated");

  assert.match(load, /scoreboard objectives remove mgg[0-9a-f]{8}00/);
  assert.match(load, /scoreboard objectives remove mgg[0-9a-f]{8}03/);
  assert.match(load, /scoreboard objectives add mgg[0-9a-f]{8}00 dummy/);
  assert.match(load, /scoreboard players set #r00 .* 12345/);
  assert.match(getMacro, /^\$scoreboard players operation #gv .* = g\$\(i\) mgg/m);
  assert.match(setMacro, /^\$scoreboard players operation g\$\(i\) mgg.* = #gv /m);
  assert.match(player, /function portable_v13_grid:portable\/grid_dungeon_get_at/);
  assert.match(jumpBranch, /scoreboard players operation #r00 .* \*= #c\d+ /);
  assert.doesNotMatch(jumpBranch, /matches \.\.-1/);
  assert.match(load, /scoreboard players set #c\d+ .* 1664525/);
  assert.match(load, /scoreboard players set #c\d+ .* 1013904223/);
  assert.match(jumpBranch, /scoreboard players set #w00a .* 1/);
  assert.match(rect, /run scoreboard players operation g0 mgg/);
  assert.doesNotMatch(rect, /return run function/);
  assert.match(tick, /execute store result score #pc .* if entity @a/);
  assert.match(tick, /matches 1 as @a\[limit=1,sort=arbitrary\] run function portable_v13_grid:portable\/player_000/);
  assert.match(tick, /scoreboard players set #ws .* 0/);
  assert.match(tick, /grid_world_terrain_slice_000/);
  assert.match(tick, /grid_world_terrain_slice_002/);
  assert.match(cleanup, /scoreboard objectives remove mgg[0-9a-f]{8}03/);
  assert.match(cleanup, /data remove storage portable_v13_grid:portable_runtime macro/);
  const finalSlice = read(output, "data/portable_v13_grid/function/portable/grid_world_terrain_slice_002.mcfunction");
  assert.match(finalSlice, /scoreboard players set #w00r .* 1000/);
  assert.match(marker, /portable_version=13/);
  assert.match(marker, /grid\.dungeon=mgg[0-9a-f]{8}00/);
  assert.match(marker, /rng\.dungeon_rng=#r00/);
  assert.match(marker, /gridWorld\.terrain\.ready=#w00r/);
});

test("v13 singleton scope permits shared writes but multiplayer scope still rejects them", () => {
  const single = extract(`
    portableDsl(game => {
      const shared = game.state("shared", 0);
      const grid = game.grid("map", { width: 2, height: 2, initial: 0, outside: 0 });
      const rng = game.rng("r", { seed: 7 });
      const players = game.players();
      game.tick(() => game.forSinglePlayer(players, player => {
        shared.add(1);
        grid.set(0, 0, 1);
        rng.int(shared, 0, 3);
      }));
    });
  `);
  assert.equal(single.version, 13);
  assert.equal(single.tickActions[0].op, "for_single_player");

  assert.throws(() => extract(`
    portableDsl(game => {
      game.state("shared", 0);
      const grid = game.grid("map", { width: 2, height: 2, initial: 0, outside: 0 });
      const players = game.players();
      game.tick(() => game.forEachPlayer(players, player => grid.set(0, 0, 1)));
    });
  `), /shared mutation.*multi-player PlayerContext/);

  assert.throws(() => parseProgram({
    version: 13,
    fixedPoint: 1000,
    state: { x: 0 },
    grids: Array.from({ length: 5 }, (_, index) => ({ id: `g${index}`, width: 1, height: 1, initial: 0, outside: 0 })),
    tick: [],
  }), /exceeds max grid count 4/);
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
    ["examples/portable-multiplayer-core/datapack/data/portable_multiplayer/mcgame/main.ts", "portable_multiplayer", 12],
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
