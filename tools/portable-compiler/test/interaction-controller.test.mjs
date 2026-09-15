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
  const js = transpileTypeScript("interaction-controller-test.ts", source, root);
  return parseProgram(extractPortableSpec("interaction-controller-test.ts", js, root));
}

function compileSource(source, namespace = "portable_controller_test") {
  const program = extract(source);
  const output = fs.mkdtempSync(path.join(os.tmpdir(), "mcgame-controller-"));
  const result = compileDatapack(program, namespace, output);
  return { program, output, result };
}

function read(output, relative) { return fs.readFileSync(path.join(output, relative), "utf8"); }

test("v24 interaction controller claim and exact-player iteration lower to generation tokens", () => {
  const { program, output } = compileSource(`
    portableDsl({ fixedPoint: 1000, ownership: { minX: 0, minZ: 0, maxX: 16, maxZ: 16 } }, game => {
      const playing = game.state("playing", 0);
      const presses = game.state("presses", 0);
      const cabinet = game.interaction("cabinet", { x: 8, y: 80, z: 8 });
      game.tick(() => {
        cabinet.onUse(player => {
          game.when(playing.eq(0), () => {
            cabinet.controller.claim(player);
            playing.set(1);
          });
        });
        cabinet.controller.forPlayer(player => {
          const personal = player.state("personal", 0);
          game.when(player.input.jump.eq(1), () => {
            presses.add(1);
            personal.add(1);
          });
        });
      });
    });
  `);

  assert.equal(program.version, 24);
  assert.equal(program.tickActions[0].op, "interaction_use");
  assert.equal(program.tickActions[0].actions[0].then[0].op, "interaction_controller_claim");
  assert.equal(program.tickActions[1].op, "interaction_controller_player");

  const load = read(output, "data/portable_controller_test/function/portable/load.mcfunction");
  const tick = read(output, "data/portable_controller_test/function/portable/tick.mcfunction");
  const marker = read(output, ".mcgame-portable-generated");
  const branch0 = read(output, "data/portable_controller_test/function/portable/branch_000.mcfunction");

  assert.match(load, /scoreboard objectives remove mic[a-f0-9]{8}00/);
  assert.match(load, /scoreboard objectives add mic[a-f0-9]{8}00 dummy/);
  assert.match(load, /scoreboard players set #ic00 mcg[a-f0-9]{8} 0/);
  assert.match(branch0, /execute if score #ic00 mcg[a-f0-9]{8} matches 2147483647 run scoreboard objectives remove mic[a-f0-9]{8}00/);
  assert.match(branch0, /execute if score #ic00 mcg[a-f0-9]{8} matches 2147483647 run scoreboard objectives add mic[a-f0-9]{8}00 dummy/);
  assert.match(branch0, /execute if score #ic00 mcg[a-f0-9]{8} matches 2147483647 run scoreboard players set #ic00 mcg[a-f0-9]{8} 0/);
  assert.match(branch0, /scoreboard players add #ic00 mcg[a-f0-9]{8} 1/);
  assert.match(branch0, /scoreboard players operation @s mic[a-f0-9]{8}00 = #ic00 mcg[a-f0-9]{8}/);
  assert.match(tick, /execute as @a if score @s mic[a-f0-9]{8}00 = #ic00 mcg[a-f0-9]{8} run function portable_controller_test:portable\/player_001/);
  assert.match(marker, /portable_version=24/);
  assert.match(marker, /interaction\.cabinet\.controller=mic[a-f0-9]{8}00;generation=#ic00/);
});

test("v24 controller claim is scoped to the matching use player and forPlayer stays root-only", () => {
  assert.throws(() => extract(`
    portableDsl(game => {
      game.state("x", 0);
      const a = game.interaction("a", { x: 0, y: 64, z: 0 });
      const b = game.interaction("b", { x: 2, y: 64, z: 0 });
      game.tick(() => a.onUse(player => b.controller.claim(player)));
    });
  `), /only valid inside this interaction's onUse callback/);

  assert.throws(() => extract(`
    portableDsl(game => {
      const x = game.state("x", 0);
      const a = game.interaction("a", { x: 0, y: 64, z: 0 });
      let saved;
      game.tick(() => {
        a.onUse(player => { saved = player; });
        a.controller.claim(saved);
      });
    });
  `), /only valid inside this interaction's onUse callback/);

  assert.throws(() => extract(`
    portableDsl(game => {
      const x = game.state("x", 0);
      const a = game.interaction("a", { x: 0, y: 64, z: 0 });
      game.tick(() => game.when(x.eq(0), () => a.controller.forPlayer(() => {})));
    });
  `), /controller\.forPlayer.*root tick scope/);

  assert.throws(() => extract(`
    portableDsl(game => {
      game.state("x", 0);
      const a = game.interaction("a", { x: 0, y: 64, z: 0 });
      game.tick(() => a.controller.forPlayer(player => player.hud("bad", { text: "bad" })));
    });
  `), /player\.hud.*not supported inside interaction controller context/);
});

test("raw v24 controller IR enforces version and matching-use scope", () => {
  const interactions = [{ id: "cabinet", x: 0, y: 64, z: 0 }];
  const v23 = {
    version: 23,
    state: { x: 0 },
    tick: [{ op: "interaction_use", interaction: "cabinet", actions: [{ op: "interaction_controller_claim", interaction: "cabinet" }] }],
    vanilla: { interactions },
  };
  assert.throws(() => parseProgram(v23), /requires portable version 24/);

  const v24 = { ...v23, version: 24 };
  const parsed = parseProgram(v24);
  assert.equal(parsed.tickActions[0].actions[0].op, "interaction_controller_claim");

  assert.throws(() => parseProgram({
    version: 24,
    state: { x: 0 },
    tick: [{ op: "interaction_controller_claim", interaction: "cabinet" }],
    vanilla: { interactions },
  }), /matching interaction_use callback/);

  assert.throws(() => parseProgram({
    version: 24,
    state: { x: 0 },
    tick: [{ op: "interaction_use", interaction: "cabinet", actions: [{ op: "interaction_controller_claim", interaction: "other" }] }],
    vanilla: { interactions: [...interactions, { id: "other", x: 2, y: 64, z: 0 }] },
  }), /matching interaction_use callback/);

  assert.throws(() => parseProgram({
    version: 24,
    state: { x: 0 },
    tick: [{ op: "if", condition: { op: "eq", left: { state: "x" }, right: 0 }, then: [{ op: "interaction_controller_player", interaction: "cabinet", actions: [] }] }],
    vanilla: { interactions },
  }), /root tick action list/);
});

test("plain v23 interaction source does not upgrade to v24", () => {
  const program = extract(`
    portableDsl(game => {
      const total = game.state("total", 0);
      const cabinet = game.interaction("cabinet", { x: 0, y: 64, z: 0 });
      game.tick(() => cabinet.onUse(() => total.add(1)));
    });
  `);
  assert.equal(program.version, 23);
});
