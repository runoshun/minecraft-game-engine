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
  const js = transpileTypeScript("controller-camera-test.ts", source, root);
  return parseProgram(extractPortableSpec("controller-camera-test.ts", js, root));
}

function compileSource(source, namespace = "portable_controller_camera") {
  const program = extract(source);
  const output = fs.mkdtempSync(path.join(os.tmpdir(), "mcgame-controller-camera-"));
  compileDatapack(program, namespace, output);
  return { program, output };
}

function read(output, relative) { return fs.readFileSync(path.join(output, relative), "utf8"); }

test("v26 controller camera locks only the currently claimed interaction controller", () => {
  const { program, output } = compileSource(`
    portableDsl({ fixedPoint: 1000, ownership: { minX: 0, minZ: 0, maxX: 16, maxZ: 16 } }, game => {
      const launches = game.state("launches", 0);
      const cabinet = game.interaction("cabinet", { x: 4, y: 65, z: 4 });
      game.camera("playfield", { x: 12, y: 80, z: 12, yaw: 180, pitch: 20, audience: cabinet.controller });
      game.tick(() => {
        cabinet.onUse(player => {
          cabinet.controller.claim(player);
          launches.add(1);
        });
        cabinet.controller.forPlayer(player => {
          game.when(player.input.jump.eq(1), () => launches.add(1));
        });
      });
    });
  `);

  assert.equal(program.version, 26);
  assert.deepEqual(program.cameras[0].audience, { interactionController: "cabinet" });

  const load = read(output, "data/portable_controller_camera/function/portable/load.mcfunction");
  const tick = read(output, "data/portable_controller_camera/function/portable/tick.mcfunction");
  const marker = read(output, ".mcgame-portable-generated");
  assert.match(load, /scoreboard objectives add mic[a-f0-9]{8}00 dummy/);
  assert.match(tick, /execute as @a\[gamemode=!spectator\] if score @s mic[a-f0-9]{8}00 = #ic00 mcg[a-f0-9]{8} in minecraft:overworld if entity @e\[type=minecraft:armor_stand,tag=mcg_c_[a-z0-9]+_playfield,limit=1\] run teleport @s @e\[type=minecraft:armor_stand,tag=mcg_c_[a-z0-9]+_playfield,limit=1\]/);
  assert.match(marker, /portable_version=26/);
  assert.match(marker, /interaction\.cabinet\.controller=mic[a-f0-9]{8}00;generation=#ic00/);
});

test("v26 controller camera parser enforces version, target, exclusivity, and position_lock", () => {
  const base = {
    state: { x: 0 },
    tick: [{ op: "interaction_use", interaction: "cabinet", actions: [{ op: "interaction_controller_claim", interaction: "cabinet" }] }],
    vanilla: {
      interactions: [{ id: "cabinet", x: 4, y: 65, z: 4 }],
      cameras: [{ id: "playfield", x: 12, y: 80, z: 12, audience: { interactionController: "cabinet" } }],
    },
  };

  assert.throws(() => parseProgram({ ...base, version: 25 }), /requires portable version 26/);
  assert.equal(parseProgram({ ...base, version: 26 }).version, 26);

  assert.throws(() => parseProgram({
    ...base,
    version: 26,
    vanilla: { ...base.vanilla, cameras: [{ id: "playfield", x: 12, y: 80, z: 12, audience: { interactionController: "missing" } }] },
  }), /unknown interaction controller missing/);

  assert.throws(() => parseProgram({
    ...base,
    version: 26,
    vanilla: { ...base.vanilla, cameras: [{ id: "playfield", x: 12, y: 80, z: 12, mode: "spectate", audience: { interactionController: "cabinet" } }] },
  }), /supports position_lock only/);

  assert.throws(() => parseProgram({
    ...base,
    version: 26,
    vanilla: { ...base.vanilla, cameras: [
      { id: "playfield", x: 12, y: 80, z: 12, audience: { interactionController: "cabinet" } },
      { id: "other", x: 8, y: 80, z: 8, audience: "all_online" },
    ] },
  }), /must be the only camera declaration/);
});


test("v26 controller return teleports to the source interaction and invalidates the token", () => {
  const { output } = compileSource(`
    portableDsl({ ownership: { minX: 0, minZ: 0, maxX: 16, maxZ: 16 } }, game => {
      game.state("x", 0);
      const cabinet = game.interaction("cabinet", { x: 4, y: 65, z: 4 });
      game.camera("playfield", { x: 12, y: 80, z: 12, audience: cabinet.controller });
      game.tick(() => {
        cabinet.onUse(player => cabinet.controller.claim(player));
        cabinet.controller.forPlayer(player => cabinet.controller.returnToInteraction(player));
      });
    });
  `);
  const player = read(output, "data/portable_controller_camera/function/portable/player_001.mcfunction");
  assert.match(player, /execute in minecraft:overworld if entity @e\[type=minecraft:interaction,tag=mcg_i_[a-z0-9]+_cabinet,limit=1\] run teleport @s @e\[type=minecraft:interaction,tag=mcg_i_[a-z0-9]+_cabinet,limit=1\]/);
  assert.match(player, /scoreboard players add #ic00 mcg[a-f0-9]{8} 1/);
  assert.doesNotMatch(player, /scoreboard players operation @s mic[a-f0-9]{8}00 =/);

  assert.throws(() => extract(`
    portableDsl(game => {
      game.state("x", 0);
      const cabinet = game.interaction("cabinet", { x: 0, y: 64, z: 0 });
      game.tick(() => cabinet.onUse(player => cabinet.controller.returnToInteraction(player)));
    });
  `), /only valid inside this controller's forPlayer callback/);
});

test("plain v25 placeable source remains v25 without controller camera audience", () => {
  const program = extract(`
    portableDsl({ ownership: { minX: 0, minZ: 0, maxX: 16, maxZ: 16 } }, game => {
      const item = game.item("cabinet_item", { name: "Cabinet", appearance: { kind: "model", model: "minecraft:stone" } });
      game.placeable("cabinet", { item, maxInstances: 1 }, table => {
        const use = table.interaction("use", { x: 0, y: 0.5, z: 0, width: 1, height: 1 });
        table.tick(() => use.onUse(player => use.controller.claim(player)));
      });
      game.tick(() => {});
    });
  `);
  assert.equal(program.version, 25);
});
