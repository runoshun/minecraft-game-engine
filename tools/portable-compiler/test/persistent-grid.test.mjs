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

function compileSource(source, namespace = "portable_v19_persistent_grid") {
  const program = extract(source);
  const output = fs.mkdtempSync(path.join(os.tmpdir(), "mcgame-v19-grid-"));
  const result = compileDatapack(program, namespace, output);
  return { program, output, result };
}

function read(output, relative) { return fs.readFileSync(path.join(output, relative), "utf8"); }
function markerMap(output) {
  return Object.fromEntries(read(output, ".mcgame-portable-generated").trim().split("\n").map(line => {
    const index = line.indexOf("=");
    return [line.slice(0, index), line.slice(index + 1)];
  }));
}

test("v19 persistent grids lower global and session cells to preserved command storage", () => {
  const { program, output, result } = compileSource(`
    portableDsl({ fixedPoint: 1000 }, game => {
      const x = game.state("x", 1);
      const z = game.state("z", 1);
      const cell = game.state("cell", 0);
      const world = game.persistentGrid("world", {
        width: 3, height: 2, initial: 0, outside: -1,
        schema: 2, onSchemaMismatch: "reset",
      });
      const party = game.teamPlayers("v19_party");
      game.tick(() => {
        world.fill(3);
        world.set(x, z, 7);
        world.get(x, z, cell);
        world.fillRect({ x: 0, z: 0, width: 1, height: 2, value: 2 });
        game.session("party", party, session => {
          const local = session.state("local", 0);
          const stash = session.persistentGrid("stash", {
            width: 2, height: 2, initial: 5, outside: -2,
            schema: 3, onSchemaMismatch: "preserve",
          });
          stash.set(1, 1, 9);
          stash.get(1, 1, local);
          stash.fillRect({ x: 0, z: 0, width: 1, height: 1, value: 4 });
        });
      });
    });
  `);

  assert.equal(program.version, 19);
  assert.equal(result.persistentGridCount, 2);
  assert.equal(result.persistentGridCellCount, 10);
  assert.equal(program.persistentGrids[0].initialRaw, 0);
  assert.equal(program.persistentGrids[0].outsideRaw, -1000);
  assert.equal(program.sessions[0].persistentGrids[0].initialRaw, 5000);

  const marker = markerMap(output);
  assert.match(marker["persistent.grid.world"], /^grids\.g[0-9a-f]{8};size=3x2;schema=2;on_mismatch=reset$/);
  assert.match(marker["session.party.persistentGrid.stash"], /^grids\.g[0-9a-f]{8};size=2x2;schema=3;on_mismatch=preserve$/);
  const worldPath = marker["persistent.grid.world"].split(";")[0];
  const stashPath = marker["session.party.persistentGrid.stash"].split(";")[0];

  const load = read(output, "data/portable_v19_persistent_grid/function/portable/load.mcfunction");
  assert.ok(load.includes(`execute unless data storage portable_v19_persistent_grid:portable_persistent ${worldPath} run data modify storage portable_v19_persistent_grid:portable_persistent ${worldPath} set value {schema:2,width:3,height:2,cells:[I;0,0,0,0,0,0]}`));
  assert.ok(load.includes(`execute unless data storage portable_v19_persistent_grid:portable_persistent ${worldPath}{schema:2} run data modify storage portable_v19_persistent_grid:portable_persistent ${worldPath}.cells set value [I;0,0,0,0,0,0]`));
  assert.ok(load.includes(`data modify storage portable_v19_persistent_grid:portable_persistent ${stashPath}.schema set value 3`));
  assert.ok(!load.includes(`execute unless data storage portable_v19_persistent_grid:portable_persistent ${stashPath}{schema:3} run data modify storage portable_v19_persistent_grid:portable_persistent ${stashPath}.cells`));

  const setMacro = read(output, "data/portable_v19_persistent_grid/function/portable/persistent_grid_world_set_macro.mcfunction");
  const getMacro = read(output, "data/portable_v19_persistent_grid/function/portable/persistent_grid_world_get_macro.mcfunction");
  assert.ok(setMacro.includes(`${worldPath}.cells[$(i)] int 1`));
  assert.ok(getMacro.includes(`data get storage portable_v19_persistent_grid:portable_persistent ${worldPath}.cells[$(i)] 1`));
  const sessionSetMacro = read(output, "data/portable_v19_persistent_grid/function/portable/session_party_persistent_grid_stash_set_macro.mcfunction");
  assert.ok(sessionSetMacro.includes(`${stashPath}.cells[$(i)] int 1`));
  const tick = read(output, "data/portable_v19_persistent_grid/function/portable/tick.mcfunction");
  assert.ok(tick.includes(`data modify storage portable_v19_persistent_grid:portable_persistent ${worldPath}.cells set value [I;3000,3000,3000,3000,3000,3000]`));
  const worldRectRow = read(output, "data/portable_v19_persistent_grid/function/portable/persistent_grid_world_rect_row_00.mcfunction");
  assert.ok(worldRectRow.includes(`${worldPath}.cells[0] int 1`));
  const stashRectRow = read(output, "data/portable_v19_persistent_grid/function/portable/session_party_persistent_grid_stash_rect_row_00.mcfunction");
  assert.ok(stashRectRow.includes(`${stashPath}.cells[0] int 1`));

  const cleanup = read(output, "data/portable_v19_persistent_grid/function/portable/cleanup.mcfunction");
  assert.doesNotMatch(cleanup, /portable_persistent/);
  const reset = read(output, "data/portable_v19_persistent_grid/function/portable/reset_persistent.mcfunction");
  assert.ok(reset.includes(`${worldPath} set value {schema:2,width:3,height:2,cells:[I;0,0,0,0,0,0]}`));
  assert.ok(reset.includes(`${stashPath} set value {schema:3,width:2,height:2,cells:[I;5000,5000,5000,5000]}`));
  const purge = read(output, "data/portable_v19_persistent_grid/function/portable/purge_persistent.mcfunction");
  assert.match(purge, /data remove storage portable_v19_persistent_grid:portable_persistent grids/);

  const ordered = compileSource(`
    portableDsl(game => {
      game.persistentGrid("alpha", { width: 1, height: 1 });
      game.persistentGrid("beta", { width: 1, height: 1 });
      game.tick(() => {});
    });
  `, "portable_v19_identity");
  const reordered = compileSource(`
    portableDsl(game => {
      game.persistentGrid("beta", { width: 1, height: 1 });
      game.persistentGrid("alpha", { width: 1, height: 1 });
      game.tick(() => {});
    });
  `, "portable_v19_identity");
  const orderedMarker = markerMap(ordered.output);
  const reorderedMarker = markerMap(reordered.output);
  assert.equal(orderedMarker["persistent.grid.alpha"].split(";")[0], reorderedMarker["persistent.grid.alpha"].split(";")[0]);
  assert.equal(orderedMarker["persistent.grid.beta"].split(";")[0], reorderedMarker["persistent.grid.beta"].split(";")[0]);
});

test("v19 persistent grid DSL and parser enforce version scope shape and declaration bounds", () => {
  assert.throws(() => parseProgram({
    version: 18,
    state: {},
    persistentGrids: [{ id: "map", width: 1, height: 1, initial: 0, outside: 0 }],
    tick: [],
  }), /persistentGrids requires portable version 19/);

  assert.throws(() => extract(`
    portableDsl(game => {
      const map = game.persistentGrid("map", { width: 2, height: 2 });
      const players = game.players();
      game.tick(() => game.forEachPlayer(players, () => map.set(0, 0, 1)));
    });
  `), /persistent shared grid mutation.*multi-player PlayerContext/);

  assert.throws(() => extract(`
    portableDsl(game => {
      ${Array.from({ length: 9 }, (_, index) => `game.persistentGrid("g${index}", { width: 1, height: 1 });`).join("\n")}
      game.tick(() => {});
    });
  `), /at most 8 persistent grids total/);

  assert.throws(() => extract(`
    portableDsl(game => {
      game.persistentGrid("too_big", { width: 64, height: 33 });
      game.tick(() => {});
    });
  `), /exceeds 2048 cells/);

  assert.throws(() => extract(`
    portableDsl(game => {
      game.persistentGrid("bad_schema", { width: 1, height: 1, schema: 0 });
      game.tick(() => {});
    });
  `), /schema.*between 1 and 2147483647/);

  assert.throws(() => parseProgram({
    version: 19,
    state: {},
    playerSets: [{ team: "party" }],
    sessions: [{
      id: "party", players: { team: "party" },
      grids: [{ id: "same", width: 1, height: 1, initial: 0, outside: 0 }],
      persistentGrids: [{ id: "same", width: 1, height: 1, initial: 0, outside: 0 }],
    }],
    tick: [],
  }), /persistentGrids id collides with another session declaration: same/);
});

test("v19 persistent grid schema preserve keeps cells while structural shape changes always reset", () => {
  const { output } = compileSource(`
    portableDsl(game => {
      game.state("x", 0);
      game.persistentGrid("keep", { width: 2, height: 2, initial: 4, schema: 7, onSchemaMismatch: "preserve" });
      game.persistentGrid("reset", { width: 2, height: 1, initial: 6, schema: 8, onSchemaMismatch: "reset" });
      game.tick(() => {});
    });
  `, "portable_v19_schema");
  const marker = markerMap(output);
  const keepPath = marker["persistent.grid.keep"].split(";")[0];
  const resetPath = marker["persistent.grid.reset"].split(";")[0];
  const load = read(output, "data/portable_v19_schema/function/portable/load.mcfunction");

  assert.ok(load.includes(`execute unless data storage portable_v19_schema:portable_persistent ${keepPath}{width:2,height:2} run data modify storage portable_v19_schema:portable_persistent ${keepPath} set value {schema:7,width:2,height:2,cells:[I;4000,4000,4000,4000]}`));
  assert.ok(!load.includes(`${keepPath}{schema:7} run data modify storage portable_v19_schema:portable_persistent ${keepPath}.cells`));
  assert.ok(load.includes(`execute unless data storage portable_v19_schema:portable_persistent ${resetPath}{schema:8} run data modify storage portable_v19_schema:portable_persistent ${resetPath}.cells set value [I;6000,6000]`));
});
