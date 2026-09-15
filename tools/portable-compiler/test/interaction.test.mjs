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
  const js = transpileTypeScript("interaction-test.ts", source, root);
  return parseProgram(extractPortableSpec("interaction-test.ts", js, root));
}

function compileSource(source, namespace = "portable_interaction_test") {
  const program = extract(source);
  const output = fs.mkdtempSync(path.join(os.tmpdir(), "mcgame-interaction-"));
  const result = compileDatapack(program, namespace, output);
  return { program, output, result };
}

function read(output, relative) { return fs.readFileSync(path.join(output, relative), "utf8"); }

test("v23 interaction use lowers to owned interaction entity and single-player callback", () => {
  const { program, output, result } = compileSource(`
    portableDsl({ fixedPoint: 1000, ownership: { minX: 0, minZ: 0, maxX: 16, maxZ: 16 } }, game => {
      const total = game.state("total", 0);
      const enabled = game.state("enabled", 1);
      const cabinet = game.interaction("cabinet", {
        x: 8, y: 80, z: 8, width: 1.5, height: 2.25, response: true, when: enabled.eq(1),
      });
      game.tick(() => {
        cabinet.onUse(player => {
          const personal = player.state("personal", 0);
          total.add(1);
          personal.add(1);
          game.when(player.input.sneak.eq(1), () => total.add(2));
        });
      });
    });
  `);

  assert.equal(program.version, 23);
  assert.equal(result.interactionCount, 1);
  assert.equal(program.interactions.length, 1);
  assert.equal(program.interactions[0].width, 1.5);
  assert.equal(program.interactions[0].height, 2.25);
  assert.equal(program.interactions[0].response, true);
  assert.equal(program.tickActions[0].op, "interaction_use");
  assert.equal(program.tickActions[0].interaction, "cabinet");

  const ownedInit = read(output, "data/portable_interaction_test/function/portable/owned_init.mcfunction");
  const spawn = read(output, "data/portable_interaction_test/function/portable/interaction_cabinet_spawn.mcfunction");
  const tick = read(output, "data/portable_interaction_test/function/portable/tick.mcfunction");
  const callback = read(output, "data/portable_interaction_test/function/portable/player_000.mcfunction");
  assert.match(ownedInit, /interaction_cabinet_spawn/);
  assert.match(spawn, /summon minecraft:interaction 8\.000000 80\.000000 8\.000000 .*width:1\.5f,height:2\.25f,response:1b/);
  assert.match(tick, /execute as @a unless score @s mpz/);
  assert.match(tick, /predicate portable_interaction_test:portable\/input\/sneak/);
  assert.match(tick, /as @e\[type=minecraft:interaction,tag=mcg_i_.*_cabinet,limit=1\] on target run function portable_interaction_test:portable\/player_000/);
  assert.match(tick, /as @e\[type=minecraft:interaction,tag=mcg_i_.*_cabinet,limit=1\] run data remove entity @s interaction/);
  assert.match(callback, /scoreboard players operation #total .* \+= /);
  assert.match(callback, /scoreboard players operation @s mps.* \+= /);
});

test("v23 interaction defaults response true and validates bounds", () => {
  const program = extract(`
    portableDsl(game => {
      game.state("x", 0);
      game.interaction("station", { x: 0, y: 64, z: 0 });
      game.tick(() => {});
    });
  `);
  assert.equal(program.version, 23);
  assert.equal(program.interactions[0].response, true);
  assert.equal(program.interactions[0].width, 1);
  assert.equal(program.interactions[0].height, 1);

  for (const field of ["width", "height"]) {
    assert.throws(() => extract(`
      portableDsl(game => {
        game.state("x", 0);
        game.interaction("bad", { x: 0, y: 64, z: 0, ${field}: 0 });
        game.tick(() => {});
      });
    `), new RegExp(`${field} must be between 0\\.01 and 64`));
  }
});

test("interaction onUse is one root tick handler and has no static HUD audience", () => {
  assert.throws(() => extract(`
    portableDsl(game => {
      const x = game.state("x", 0);
      const station = game.interaction("station", { x: 0, y: 64, z: 0 });
      game.tick(() => game.when(x.eq(0), () => station.onUse(() => {})));
    });
  `), /must be declared directly in the root tick scope/);

  assert.throws(() => extract(`
    portableDsl(game => {
      game.state("x", 0);
      const station = game.interaction("station", { x: 0, y: 64, z: 0 });
      game.tick(() => { station.onUse(() => {}); station.onUse(() => {}); });
    });
  `), /only one onUse/);

  assert.throws(() => extract(`
    portableDsl(game => {
      game.state("x", 0);
      const station = game.interaction("station", { x: 0, y: 64, z: 0 });
      game.tick(() => station.onUse(player => player.hud("bad", { text: "bad" })));
    });
  `), /player\.hud.*not supported inside interaction onUse/);
});

test("raw v23 interaction IR is version-gated and validates use handlers", () => {
  assert.throws(() => parseProgram({
    version: 22,
    state: { x: 0 },
    tick: [],
    vanilla: { interactions: [{ id: "station", x: 0, y: 64, z: 0 }] },
  }), /requires portable version 23/);

  const base = {
    version: 23,
    state: { x: 0 },
    playerState: { personal: 0 },
    tick: [{ op: "interaction_use", interaction: "station", actions: [{ op: "player_add", target: "personal", value: 1 }] }],
    vanilla: { interactions: [{ id: "station", x: 0, y: 64, z: 0, response: false }] },
  };
  const parsed = parseProgram(base);
  assert.equal(parsed.interactions[0].response, false);
  assert.equal(parsed.tickActions[0].actions[0].op, "player_add");

  assert.throws(() => parseProgram({ ...base, tick: [{ op: "interaction_use", interaction: "missing", actions: [] }] }), /unknown interaction missing/);
  assert.throws(() => parseProgram({ ...base, tick: [base.tick[0], base.tick[0]] }), /duplicate use handler/);
  assert.throws(() => parseProgram({ ...base, tick: [{ op: "if", condition: { op: "eq", left: { state: "x" }, right: 0 }, then: [base.tick[0]] }] }), /root tick action list/);
});

test("v23 interaction declarations remain bounded", () => {
  const declarations = Array.from({ length: 65 }, (_, i) => `game.interaction("i${i}", { x: ${i}, y: 64, z: 0 });`).join("\n");
  assert.throws(() => extract(`
    portableDsl(game => {
      game.state("x", 0);
      ${declarations}
      game.tick(() => {});
    });
  `), /at most 64 interaction/);
});
