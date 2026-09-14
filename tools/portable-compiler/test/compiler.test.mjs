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
  const rectRow0 = read(output, "data/portable_v13_grid/function/portable/grid_dungeon_rect_row_00.mcfunction");
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
  assert.match(rect, /run function portable_v13_grid:portable\/grid_dungeon_rect_row_00/);
  assert.match(rectRow0, /run scoreboard players operation g0 mgg/);
  assert.ok(rect.trim().split("\n").length <= 6 + program.grids[0].height);
  assert.equal(rectRow0.trim().split("\n").length, program.grids[0].width);
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

test("v13 procedural roguelike reference keeps topology runtime-authoritative", () => {
  const relative = "examples/portable-procedural-roguelike/datapack/data/portable_roguelike/mcgame/main.ts";
  const source = fs.readFileSync(path.join(root, relative), "utf8");
  const program = parseProgram(extractPortableSpec(relative, transpileTypeScript(relative, source, root), root));
  const output = fs.mkdtempSync(path.join(os.tmpdir(), "mcgame-v13-roguelike-"));
  const result = compileDatapack(program, "portable_roguelike", output);

  assert.equal(program.version, 13);
  assert.equal(program.grids.length, 1);
  assert.equal(program.grids[0].width, 29);
  assert.equal(program.grids[0].height, 37);
  assert.equal(program.rngs.length, 1);
  assert.equal(program.gridWorlds.length, 1);
  assert.equal(program.worldBatches.length, 0);
  assert.equal(result.actorCount, 3);
  assert.equal(result.projectionCount, 2);

  const load = read(output, "data/portable_roguelike/function/portable/load.mcfunction");
  const tick = read(output, "data/portable_roguelike/function/portable/tick.mcfunction");
  const rect = read(output, "data/portable_roguelike/function/portable/grid_dungeon_rect_prepare.mcfunction");
  const finalRectRow = read(output, "data/portable_roguelike/function/portable/grid_dungeon_rect_row_36.mcfunction");
  assert.doesNotMatch(load, /setblock /);
  assert.match(load, /scoreboard players set #r00 .* 1374772973/);
  assert.match(tick, /execute store result score #pc .* if entity @a/);
  assert.match(tick, /grid_world_terrain_slice_008/);
  assert.match(finalRectRow, /if score #gx .* <= .* if score #gex .* >=/);
  assert.match(rect, /grid_dungeon_rect_row_36/);
  assert.match(finalRectRow, /scoreboard players operation g1072 mgg/);
  assert.equal(rect.trim().split("\n").length, 6 + 37);
  assert.equal(finalRectRow.trim().split("\n").length, 29);
});

test("v14 team PlayerSets partition player rules HUDs and cameras", () => {
  const { program, output, result } = compileSource(`
    portableDsl({ fixedPoint: 1000, ownership: { minX: 240, minZ: 0, maxX: 288, maxZ: 16 } }, game => {
      const redHits = game.state("redHits", 0);
      const blueHits = game.state("blueHits", 0);
      const red = game.teamPlayers("v14_red");
      const blue = game.teamPlayers("v14_blue");

      game.camera("red", { x: 248, y: 100, z: 8, yaw: 0, pitch: 15, audience: red });
      game.camera("blue", { x: 280, y: 100, z: 8, yaw: 180, pitch: 15, audience: blue });

      game.tick(() => {
        game.forEachPlayer(red, player => {
          const meter = player.state("meter", 0);
          game.when(player.input.left.eq(1), () => meter.sub(1));
          player.hud("red_status", { text: ["RED ", meter] });
        });
        game.forEachPlayer(blue, player => {
          const meter = player.state("meter", 0);
          game.when(player.input.right.eq(1), () => meter.add(1));
          player.hud("blue_status", { text: ["BLUE ", meter] });
        });
        game.forSinglePlayer(red, player => game.when(player.input.left.eq(1), () => redHits.add(1)));
        game.forSinglePlayer(blue, player => game.when(player.input.right.eq(1), () => blueHits.add(1)));
      });
    });
  `, "portable_v14_teams");

  assert.equal(program.version, 14);
  assert.deepEqual([...program.playerTeams].sort(), ["v14_blue", "v14_red"]);
  assert.equal(result.playerSetCount, 2);
  assert.equal(result.cameraCount, 2);
  assert.equal(result.playerHudCount, 2);

  const tick = read(output, "data/portable_v14_teams/function/portable/tick.mcfunction");
  const cleanup = read(output, "data/portable_v14_teams/function/portable/cleanup.mcfunction");
  assert.match(tick, /execute as @a\[team=v14_red\] unless score @s mpz/);
  assert.match(tick, /execute as @a\[team=v14_blue\] unless score @s mpz/);
  assert.match(tick, /scoreboard players set @a\[team=v14_red\] mpi[0-9a-f]{8}03 0/);
  assert.match(tick, /scoreboard players set @a\[team=v14_blue\] mpi[0-9a-f]{8}04 0/);
  assert.match(tick, /execute as @a\[team=v14_red\] run function portable_v14_teams:portable\/player_000/);
  assert.match(tick, /execute as @a\[team=v14_blue\] run function portable_v14_teams:portable\/player_001/);
  assert.match(tick, /if entity @a\[team=v14_red\]/);
  assert.match(tick, /matches 1 as @a\[team=v14_red,limit=1,sort=arbitrary\]/);
  assert.match(tick, /if entity @a\[team=v14_blue\]/);
  assert.match(tick, /matches 1 as @a\[team=v14_blue,limit=1,sort=arbitrary\]/);
  assert.match(tick, /execute as @a\[team=v14_red,gamemode=!spectator\].*tag=mcg_c_.*_red/);
  assert.match(tick, /execute as @a\[team=v14_blue,gamemode=!spectator\].*tag=mcg_c_.*_blue/);
  assert.match(tick, /execute as @a\[team=v14_red\] run title @s actionbar/);
  assert.match(tick, /execute as @a\[team=v14_blue\] run title @s actionbar/);
  assert.doesNotMatch(tick, /execute as @a unless score @s mpz/);
  assert.match(cleanup, /title @a\[team=v14_red\] actionbar/);
  assert.match(cleanup, /title @a\[team=v14_blue\] actionbar/);
});

test("v14 cleanup clears only HUD audiences", () => {
  const { output } = compileSource(`
    portableDsl(game => {
      game.state("x", 0);
      const red = game.teamPlayers("red");
      const blue = game.teamPlayers("blue");
      game.camera("blue", { x: 0, y: 80, z: 0, audience: blue });
      game.tick(() => {
        game.forEachPlayer(red, player => {
          const meter = player.state("meter", 0);
          player.hud("red_status", { text: ["RED ", meter] });
        });
      });
    });
  `, "portable_v14_cleanup_hud");

  const cleanup = read(output, "data/portable_v14_cleanup_hud/function/portable/cleanup.mcfunction");
  assert.match(cleanup, /title @a\[team=red\] actionbar/);
  assert.doesNotMatch(cleanup, /title @a\[team=blue\] actionbar/);
});

test("v14 rejects unsafe or overlapping team PlayerSets", () => {
  assert.throws(() => extract(`
    portableDsl(game => {
      game.state("x", 0);
      game.teamPlayers("bad team");
      game.tick(() => {});
    });
  `), /teamPlayers.*must match/);

  assert.throws(() => parseProgram({
    version: 14,
    state: { x: 0 },
    playerSets: Array.from({ length: 9 }, (_, i) => ({ team: `t${i}` })),
    tick: [],
  }), /exceeds max player-set count 8/);

  assert.throws(() => extract(`
    portableDsl(game => {
      game.state("x", 0);
      const red = game.teamPlayers("red");
      game.camera("a", { x: 0, y: 80, z: 0, audience: red });
      game.camera("b", { x: 1, y: 80, z: 0, audience: red });
      game.tick(() => {});
    });
  `), /camera duplicate audience team:red/);

  assert.throws(() => parseProgram({
    version: 13,
    state: { x: 0 },
    playerSets: [{ team: "red" }],
    tick: [],
  }), /playerSets requires portable version 14/);
});

test("v15 sessions isolate same-named scalar Grid RNG and HUD lowering", () => {
  const { program, output, result } = compileSource(`
    portableDsl(game => {
      const red = game.teamPlayers("v15_red");
      const blue = game.teamPlayers("v15_blue");
      game.tick(() => {
        game.session("red", red, session => {
          const score = session.state("score", 0);
          const cell = session.state("cell", 0);
          const sample = session.state("sample", 0);
          const map = session.grid("map", { width: 2, height: 2, initial: 0, outside: 9 });
          const rng = session.rng("run", { seed: 7 });
          session.forSinglePlayer(player => {
            game.when(player.input.left.eq(1), () => {
              score.add(1);
              map.set(0, 0, score);
              map.get(0, 0, cell);
              rng.int(sample, 1, 9);
            });
            player.hud("red_status", { text: ["R ", score, " C ", cell, " N ", sample] });
          });
        });
        game.session("blue", blue, session => {
          const score = session.state("score", 0);
          const cell = session.state("cell", 0);
          const sample = session.state("sample", 0);
          const map = session.grid("map", { width: 2, height: 2, initial: 0, outside: 9 });
          const rng = session.rng("run", { seed: 7 });
          session.forSinglePlayer(player => {
            game.when(player.input.right.eq(1), () => {
              score.add(1);
              map.set(0, 0, score);
              map.get(0, 0, cell);
              rng.int(sample, 1, 9);
            });
            player.hud("blue_status", { text: ["B ", score, " C ", cell, " N ", sample] });
          });
        });
      });
    });
  `, "portable_v15_sessions");

  assert.equal(program.version, 15);
  assert.deepEqual(program.sessions.map(session => session.id), ["red", "blue"]);
  assert.deepEqual(program.sessions.map(session => Object.keys(session.initialState).sort()), [
    ["cell", "sample", "score"], ["cell", "sample", "score"],
  ]);
  assert.equal(result.sessionCount, 2);
  assert.equal(result.sessionStateCount, 6);
  assert.equal(result.sessionGridCount, 2);
  assert.equal(result.sessionRngCount, 2);

  const markerText = read(output, ".mcgame-portable-generated");
  const marker = Object.fromEntries(markerText.trim().split("\n").map(line => {
    const index = line.indexOf("=");
    return [line.slice(0, index), line.slice(index + 1)];
  }));
  assert.notEqual(marker["session.red.state.score"], marker["session.blue.state.score"]);
  assert.notEqual(marker["session.red.grid.map"], marker["session.blue.grid.map"]);
  assert.notEqual(marker["session.red.rng.run"], marker["session.blue.rng.run"]);

  const redSet = read(output, "data/portable_v15_sessions/function/portable/session_red_grid_map_set_macro.mcfunction");
  const blueSet = read(output, "data/portable_v15_sessions/function/portable/session_blue_grid_map_set_macro.mcfunction");
  assert.ok(redSet.includes(marker["session.red.grid.map"]));
  assert.ok(blueSet.includes(marker["session.blue.grid.map"]));
  assert.doesNotMatch(redSet, new RegExp(marker["session.blue.grid.map"]));
  assert.doesNotMatch(blueSet, new RegExp(marker["session.red.grid.map"]));

  const tick = read(output, "data/portable_v15_sessions/function/portable/tick.mcfunction");
  assert.match(tick, /if entity @a\[team=v15_red\]/);
  assert.match(tick, /if entity @a\[team=v15_blue\]/);
  assert.ok(tick.includes(`= ${marker["session.red.state.score"]} ${result.objective}`));
  assert.ok(tick.includes(`= ${marker["session.blue.state.score"]} ${result.objective}`));
});

test("v15 rejects session scope escapes unsafe mutation and invalid membership", () => {
  assert.throws(() => extract(`
    portableDsl(game => {
      const red = game.teamPlayers("red");
      let escaped;
      game.tick(() => {
        game.session("red", red, session => { escaped = session.state("score", 0); });
        game.when(escaped.eq(0), () => {});
      });
    });
  `), /session state reference escaped its SessionContext/);

  assert.throws(() => extract(`
    portableDsl(game => {
      const global = game.state("global", 0);
      const red = game.teamPlayers("red");
      game.tick(() => game.session("red", red, () => global.add(1)));
    });
  `), /global shared state mutation is not allowed inside SessionContext/);

  assert.throws(() => extract(`
    portableDsl(game => {
      const red = game.teamPlayers("red");
      game.tick(() => game.session("red", red, session => {
        const score = session.state("score", 0);
        session.forEachPlayer(() => score.add(1));
      }));
    });
  `), /session-shared mutation.*multi-player PlayerContext/);

  assert.throws(() => extract(`
    portableDsl(game => {
      const players = game.players();
      game.tick(() => game.session("all", players, () => {}));
    });
  `), /session.*requires a team PlayerSet/);

  assert.throws(() => extract(`
    portableDsl(game => {
      const red = game.teamPlayers("red");
      game.tick(() => {
        game.session("a", red, session => { session.state("score", 0); });
        game.session("b", red, session => { session.state("score", 0); });
      });
    });
  `), /already bound to another session/);

  assert.throws(() => parseProgram({
    version: 14,
    state: {},
    playerSets: [{ team: "red" }],
    sessions: [{ id: "red", players: { team: "red" }, state: { score: 0 } }],
    tick: [],
  }), /sessions requires portable version 15/);

  assert.throws(() => parseProgram({
    version: 15,
    state: {},
    playerSets: [{ team: "red" }, { team: "blue" }],
    sessions: [
      { id: "red", players: { team: "red" }, state: { score: 0 } },
      { id: "blue", players: { team: "blue" }, state: { score: 0 } },
    ],
    tick: [{ op: "for_session", session: "red", actions: [
      { op: "for_single_player", players: { team: "blue" }, actions: [] },
    ] }],
  }), /PlayerSet must match session red/);

  const teams = Array.from({ length: 8 }, (_, index) => ({ team: `t${index}` }));
  assert.throws(() => parseProgram({
    version: 15,
    state: {},
    playerSets: teams,
    sessions: teams.map((players, index) => ({
      id: `s${index}`,
      players,
      state: {},
      grids: [
        { id: "a", width: 64, height: 32, initial: 0, outside: 0 },
        { id: "b", width: 64, height: 32, initial: 0, outside: 0 },
      ],
    })),
    tick: [],
  }), /aggregate session grid cell count 16384/);
});

test("v16 session grid-world projections isolate source grids and readiness", () => {
  const { program, output, result } = compileSource(`
    portableDsl({ ownership: { minX: 400, minZ: 0, maxX: 448, maxZ: 16 } }, game => {
      const red = game.teamPlayers("v16_red");
      const blue = game.teamPlayers("v16_blue");
      game.tick(() => {
        game.session("red", red, session => {
          const initialized = session.state("initialized", 0);
          const readySeen = session.state("readySeen", 0);
          const map = session.grid("map", { width: 2, height: 2, initial: 0, outside: 0 });
          const terrain = session.gridWorld("terrain", {
            grid: map, originX: 404, y: 100, originZ: 4, cellsPerTick: 2,
            palette: [{ value: 0, block: "minecraft:black_concrete" }, { value: 1, block: "minecraft:red_concrete" }],
          });
          game.when(initialized.eq(0), () => { map.set(0, 0, 1); terrain.rebuild(); initialized.set(1); });
          game.when(terrain.ready.eq(1), () => readySeen.set(1));
        });
        game.session("blue", blue, session => {
          const initialized = session.state("initialized", 0);
          const readySeen = session.state("readySeen", 0);
          const map = session.grid("map", { width: 2, height: 2, initial: 0, outside: 0 });
          const terrain = session.gridWorld("terrain", {
            grid: map, originX: 436, y: 100, originZ: 4, cellsPerTick: 2,
            palette: [{ value: 0, block: "minecraft:black_concrete" }, { value: 1, block: "minecraft:blue_concrete" }],
          });
          game.when(initialized.eq(0), () => { map.set(1, 1, 1); terrain.rebuild(); initialized.set(1); });
          game.when(terrain.ready.eq(1), () => readySeen.set(1));
        });
      });
    });
  `, "portable_v16_session_world");

  assert.equal(program.version, 16);
  assert.equal(result.sessionGridWorldCount, 2);
  const marker = Object.fromEntries(read(output, ".mcgame-portable-generated").trim().split("\n").map(line => {
    const index = line.indexOf("=");
    return [line.slice(0, index), line.slice(index + 1)];
  }));
  assert.notEqual(marker["session.red.gridWorld.terrain.ready"], marker["session.blue.gridWorld.terrain.ready"]);
  const redSlice = read(output, "data/portable_v16_session_world/function/portable/session_red_grid_world_terrain_slice_000.mcfunction");
  const blueSlice = read(output, "data/portable_v16_session_world/function/portable/session_blue_grid_world_terrain_slice_000.mcfunction");
  assert.ok(redSlice.includes(marker["session.red.grid.map"]));
  assert.ok(blueSlice.includes(marker["session.blue.grid.map"]));
  assert.match(redSlice, /setblock 404 100 4 minecraft:red_concrete/);
  assert.match(blueSlice, /setblock 436 100 4 minecraft:blue_concrete/);
  const tick = read(output, "data/portable_v16_session_world/function/portable/tick.mcfunction");
  assert.match(tick, /session_red_grid_world_terrain_slice_000/);
  assert.match(tick, /session_blue_grid_world_terrain_slice_000/);
});

test("v16 rejects session grid-world scope escapes unsafe rebuilds ownership violations and overlaps", () => {
  assert.throws(() => extract(`
    portableDsl(game => {
      const red = game.teamPlayers("red");
      let escaped;
      game.tick(() => {
        game.session("red", red, session => {
          const map = session.grid("map", { width: 1, height: 1 });
          escaped = session.gridWorld("terrain", { grid: map, originX: 0, y: 80, originZ: 0, palette: [{ value: 0, block: "minecraft:stone" }] }).ready;
        });
        game.when(escaped.eq(1), () => {});
      });
    });
  `), /session grid-world ready reference escaped its SessionContext/);

  assert.throws(() => extract(`
    portableDsl(game => {
      const red = game.teamPlayers("red");
      game.tick(() => game.session("red", red, session => {
        const map = session.grid("map", { width: 1, height: 1 });
        const terrain = session.gridWorld("terrain", { grid: map, originX: 0, y: 80, originZ: 0, palette: [{ value: 0, block: "minecraft:stone" }] });
        session.forEachPlayer(() => terrain.rebuild());
      }));
    });
  `), /session-shared mutation.*multi-player PlayerContext/);

  assert.throws(() => extract(`
    portableDsl({ ownership: { minX: 0, minZ: 0, maxX: 8, maxZ: 8 } }, game => {
      const red = game.teamPlayers("red");
      const blue = game.teamPlayers("blue");
      game.tick(() => {
        game.session("red", red, session => {
          const map = session.grid("map", { width: 2, height: 2 });
          session.gridWorld("terrain", { grid: map, originX: 0, y: 80, originZ: 0, palette: [{ value: 0, block: "minecraft:stone" }] });
        });
        game.session("blue", blue, session => {
          const map = session.grid("map", { width: 2, height: 2 });
          session.gridWorld("terrain", { grid: map, originX: 1, y: 80, originZ: 1, palette: [{ value: 0, block: "minecraft:dirt" }] });
        });
      });
    });
  `), /grid-world footprints overlap/);

  assert.throws(() => extract(`
    portableDsl(game => {
      const red = game.teamPlayers("red");
      game.tick(() => game.session("red", red, session => {
        const map = session.grid("map", { width: 1, height: 1 });
        session.gridWorld("terrain", { grid: map, originX: 0, y: 80, originZ: 0, palette: [{ value: 0, block: "minecraft:stone" }] });
      }));
    });
  `), /session grid-world projection requires vanilla\.ownership/);

  assert.throws(() => extract(`
    portableDsl({ ownership: { minX: 0, minZ: 0, maxX: 3, maxZ: 3 } }, game => {
      const red = game.teamPlayers("red");
      game.tick(() => game.session("red", red, session => {
        const map = session.grid("map", { width: 2, height: 2 });
        session.gridWorld("terrain", { grid: map, originX: 3, y: 80, originZ: 3, palette: [{ value: 0, block: "minecraft:stone" }] });
      }));
    });
  `), /session grid-world projection red\.terrain must be inside vanilla\.ownership/);

  assert.throws(() => extract(`
    portableDsl({ ownership: { minX: 0, minZ: 0, maxX: 8, maxZ: 8 } }, game => {
      const globalMap = game.grid("global_map", { width: 2, height: 2 });
      game.gridWorld("global_terrain", { grid: globalMap, originX: 1, y: 80, originZ: 1, palette: [{ value: 0, block: "minecraft:stone" }] });
      const red = game.teamPlayers("red");
      game.tick(() => game.session("red", red, session => {
        const map = session.grid("map", { width: 2, height: 2 });
        session.gridWorld("terrain", { grid: map, originX: 2, y: 80, originZ: 2, palette: [{ value: 0, block: "minecraft:red_concrete" }] });
      }));
    });
  `), /grid-world footprints overlap.*global global_terrain.*session red\.terrain/);

  assert.throws(() => parseProgram({
    version: 15,
    state: {},
    playerSets: [{ team: "red" }],
    sessions: [{ id: "red", players: { team: "red" }, grids: [{ id: "map", width: 1, height: 1, initial: 0, outside: 0 }], gridWorlds: [{ id: "terrain", grid: "map", originX: 0, y: 80, originZ: 0, cellsPerTick: 1, palette: [{ value: 0, block: "minecraft:stone" }] }] }],
    tick: [],
  }), /gridWorlds requires portable version 16/);
});

test("v17 reductions lower count sum min max any all for global and session state", () => {
  const { program, output } = compileSource(`
    portableDsl({ fixedPoint: 1000 }, game => {
      const red = game.teamPlayers("v17_red");
      const count = game.state("count", 0);
      const sum = game.state("sum", 0);
      const min = game.state("min", -1);
      const max = game.state("max", -1);
      const any = game.state("any", 0);
      const all = game.state("all", 0);
      game.tick(() => {
        game.reduce.count(red, count);
        game.reduce.sum(red, sum, player => player.state("score", 0));
        game.reduce.min(red, min, -7, player => player.state("score", 0));
        game.reduce.max(red, max, 9, player => player.state("score", 0));
        game.reduce.any(red, any, player => player.state("ready", 0).eq(1));
        game.reduce.all(red, all, player => player.state("ready", 0).eq(1));
        game.session("red", red, session => {
          const localCount = session.state("count", 0);
          const localSum = session.state("sum", 0);
          session.reduce.count(localCount);
          session.reduce.sum(localSum, player => player.state("score", 0));
        });
      });
    });
  `, "portable_v17_reduce");

  assert.equal(program.version, 17);
  assert.deepEqual(Object.keys(program.initialPlayerState).sort(), ["ready", "score"]);
  const globalReductions = program.tickActions.filter(action => action.op === "player_reduce");
  assert.deepEqual(globalReductions.map(action => action.kind), ["count", "sum", "min", "max", "any", "all"]);
  const sessionAction = program.tickActions.find(action => action.op === "for_session");
  assert.deepEqual(sessionAction.actions.filter(action => action.op === "player_reduce").map(action => [action.kind, action.session]), [["count", "red"], ["sum", "red"]]);

  const tick = read(output, "data/portable_v17_reduce/function/portable/tick.mcfunction");
  assert.match(tick, /execute store result score #count .* if entity @a\[team=v17_red\]/);
  assert.match(tick, /scoreboard players operation #count .* \*= #c\d+/);
  assert.match(tick, /scoreboard players set #sum .* 0/);
  assert.match(tick, /execute as @a\[team=v17_red\] run scoreboard players operation #sum .* \+= @s mps[0-9a-f]{8}\d\d/);
  assert.match(tick, /scoreboard players set #min .* -7000/);
  assert.match(tick, /scoreboard players operation #min .* < @s mps/);
  assert.match(tick, /scoreboard players set #max .* 9000/);
  assert.match(tick, /scoreboard players operation #max .* > @s mps/);
  assert.match(tick, /scoreboard players set #any .* 0/);
  assert.match(tick, /run scoreboard players set #any .* 1000/);
  assert.match(tick, /scoreboard players set #all .* 1000/);
  assert.match(tick, /run scoreboard players set #all .* 0/);
  assert.match(tick, /#ss\d{4}/);
});

test("v17 reduction callbacks are read-only and parser enforces scope version and bounds", () => {
  assert.throws(() => extract(`
    portableDsl(game => {
      const players = game.players();
      const total = game.state("total", 0);
      game.tick(() => game.reduce.sum(players, total, player => {
        const score = player.state("score", 0);
        score.add(1);
        return score;
      }));
    });
  `), /reduction selector callback is read-only/);

  assert.throws(() => extract(`
    portableDsl(game => {
      const players = game.players();
      const total = game.state("total", 0);
      game.tick(() => game.forEachPlayer(players, () => game.reduce.count(players, total)));
    });
  `), /cannot be used inside PlayerContext/);

  assert.throws(() => extract(`
    portableDsl(game => {
      const global = game.state("global", 0);
      const red = game.teamPlayers("red");
      game.tick(() => game.session("red", red, session => session.reduce.count(global)));
    });
  `), /target must be a state from the active session/);

  assert.throws(() => parseProgram({
    version: 16,
    state: { count: 0 },
    playerSets: [{ team: "red" }],
    tick: [{ op: "player_reduce", kind: "count", players: { team: "red" }, target: "count" }],
  }), /requires portable version 17/);

  assert.throws(() => parseProgram({
    version: 17,
    state: { min: 0 },
    playerState: { score: 0 },
    playerSets: [{ team: "red" }],
    tick: [{ op: "player_reduce", kind: "min", players: { team: "red" }, target: "min", value: { playerState: "score" } }],
  }), /\.empty is required/);

  assert.throws(() => parseProgram({
    version: 17,
    state: {},
    playerSets: [{ team: "red" }, { team: "blue" }],
    sessions: [{ id: "red", players: { team: "red" }, state: { count: 0 } }],
    tick: [{ op: "for_session", session: "red", actions: [
      { op: "player_reduce", kind: "count", players: { team: "blue" }, target: "count" },
    ] }],
  }), /PlayerSet must match session red/);

  assert.throws(() => parseProgram({
    version: 17,
    state: { count: 0 },
    tick: Array.from({ length: 65 }, () => ({ op: "player_reduce", kind: "count", players: "all_online", target: "count" })),
  }), /exceeds max player reduction count 64/);
});

test("v17 acceptance example emits explicit empty reduction semantics", () => {
  const relative = "examples/portable-player-reductions/datapack/data/portable_reductions/mcgame/main.ts";
  const source = fs.readFileSync(path.join(root, relative), "utf8");
  const program = parseProgram(extractPortableSpec(relative, transpileTypeScript(relative, source, root), root));
  assert.equal(program.version, 17);
  const output = fs.mkdtempSync(path.join(os.tmpdir(), "mcgame-v17-acceptance-"));
  compileDatapack(program, "portable_reductions", output);
  const markerText = read(output, ".mcgame-portable-generated");
  const marker = Object.fromEntries(markerText.trim().split("\n").map(line => {
    const index = line.indexOf("=");
    return [line.slice(0, index), line.slice(index + 1)];
  }));
  const tick = read(output, "data/portable_reductions/function/portable/tick.mcfunction");
  assert.ok(tick.includes(`scoreboard players set ${marker["session.party.state.minimum"]} ${marker.objective} -1000`));
  assert.ok(tick.includes(`scoreboard players set ${marker["session.party.state.maximum"]} ${marker.objective} -1000`));
  assert.ok(tick.includes(`scoreboard players set ${marker["session.party.state.anyReady"]} ${marker.objective} 0`));
  assert.ok(tick.includes(`scoreboard players set ${marker["session.party.state.allReady"]} ${marker.objective} 1000`));
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
    ["examples/portable-procedural-roguelike/datapack/data/portable_roguelike/mcgame/main.ts", "portable_roguelike", 13],
    ["examples/portable-team-player-sets/datapack/data/portable_team_players/mcgame/main.ts", "portable_team_players", 14],
    ["examples/portable-session-local/datapack/data/portable_sessions/mcgame/main.ts", "portable_sessions", 15],
    ["examples/portable-session-grid-world/datapack/data/portable_session_world/mcgame/main.ts", "portable_session_world", 16],
    ["examples/portable-player-reductions/datapack/data/portable_reductions/mcgame/main.ts", "portable_reductions", 17],
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
