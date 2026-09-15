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

function compileSource(source, namespace = "portable_actor_v22") {
  const program = extract(source);
  const output = fs.mkdtempSync(path.join(os.tmpdir(), "mcgame-actor-v22-"));
  compileDatapack(program, namespace, output);
  return { program, output };
}

function read(output, relative) {
  return fs.readFileSync(path.join(output, relative), "utf8");
}

test("v22 DSL expands mannequin profile pose equipment and pitch", () => {
  const { program, output } = compileSource(`
    portableDsl({ fixedPoint: 1000, ownership: { minX: 0, minZ: 0, maxX: 16, maxZ: 16 } }, game => {
      const yaw = game.state("yaw", 30);
      const pitch = game.state("pitch", -10);
      game.actor("hero", {
        x: 8, y: 80, z: 8,
        yaw, pitch,
        profile: { texture: "minecraft:entity/player/slim/alex", model: "slim" },
        hiddenLayers: ["cape", "hat"],
        pose: "crouching",
        mainHand: "left",
        equipment: {
          head: "minecraft:diamond_helmet",
          chest: "minecraft:diamond_chestplate",
          mainhand: "minecraft:diamond_sword",
          offhand: "minecraft:shield"
        }
      });
      game.tick(() => {});
    });
  `);

  assert.equal(program.version, 22);
  assert.equal(program.actors[0].pose, "crouching");
  assert.equal(program.actors[0].mainHand, "left");
  assert.deepEqual(program.actors[0].hiddenLayers, ["cape", "hat"]);
  assert.equal(program.actors[0].profile.texture, "minecraft:entity/player/slim/alex");
  assert.equal(program.actors[0].equipment.mainhand, "minecraft:diamond_sword");

  const spawn = read(output, "data/portable_actor_v22/function/portable/actor_hero_spawn.mcfunction");
  assert.match(spawn, /Rotation:\[30\.000f,-10\.000f\]/);
  assert.match(spawn, /immovable:1b/);
  assert.match(spawn, /profile:\{texture:"minecraft:entity\/player\/slim\/alex",model:"slim"\}/);
  assert.match(spawn, /hidden_layers:\["cape","hat"\]/);
  assert.match(spawn, /pose:"crouching"/);
  assert.match(spawn, /main_hand:"left"/);
  assert.match(spawn, /equipment:\{head:\{id:"minecraft:diamond_helmet"\},chest:\{id:"minecraft:diamond_chestplate"\},mainhand:\{id:"minecraft:diamond_sword"\},offhand:\{id:"minecraft:shield"\}\}/);

  const tick = read(output, "data/portable_actor_v22/function/portable/tick.mcfunction");
  assert.match(tick, /Rotation\[0\] float 0\.001/);
  assert.match(tick, /Rotation\[1\] float 0\.001/);
});

test("v22 preserves zombie and skeleton intent unless explicit head equipment overrides it", () => {
  const { output } = compileSource(`
    portableDsl({ fixedPoint: 1000 }, game => {
      game.state("ready", 1);
      game.actor("zombie", { entityType: "minecraft:zombie", x: 0, y: 80, z: 0, pose: "standing" });
      game.actor("skeleton", { entityType: "minecraft:skeleton", x: 2, y: 80, z: 0, pose: "standing", equipment: { head: "minecraft:carved_pumpkin" } });
      game.tick(() => {});
    });
  `, "portable_actor_heads");

  const zombie = read(output, "data/portable_actor_heads/function/portable/actor_zombie_spawn.mcfunction");
  const skeleton = read(output, "data/portable_actor_heads/function/portable/actor_skeleton_spawn.mcfunction");
  assert.match(zombie, /equipment:\{head:\{id:"minecraft:zombie_head"\}\}/);
  assert.match(skeleton, /equipment:\{head:\{id:"minecraft:carved_pumpkin"\}\}/);
  assert.doesNotMatch(skeleton, /skeleton_skull/);
});

test("expanded actor fields require portable version 22 in raw IR", () => {
  assert.throws(() => parseProgram({
    version: 21,
    state: { ready: 1 },
    vanilla: { actors: [{ id: "hero", x: 0, y: 80, z: 0, pose: "crouching" }] },
    tick: []
  }), /expanded actor presentation requires portable version 22/);

  const program = parseProgram({
    version: 22,
    state: { ready: 1 },
    vanilla: { actors: [{ id: "hero", x: 0, y: 80, z: 0, profile: { texture: "minecraft:entity/player/wide/steve", model: "wide" }, equipment: { mainhand: "minecraft:iron_sword" } }] },
    tick: []
  });
  assert.equal(program.actors[0].profile.model, "wide");
  assert.equal(program.actors[0].equipment.mainhand, "minecraft:iron_sword");
});

test("v22 actor validation rejects raw-NBT-shaped presentation escapes", () => {
  assert.throws(() => extract(`
    portableDsl(game => {
      game.state("ready", 1);
      game.actor("hero", { x: 0, y: 80, z: 0, profile: { properties: [] } });
      game.tick(() => {});
    });
  `), /profile\.properties is not supported/);

  assert.throws(() => extract(`
    portableDsl(game => {
      game.state("ready", 1);
      game.actor("hero", { x: 0, y: 80, z: 0, equipment: { body: "minecraft:saddle" } });
      game.tick(() => {});
    });
  `), /equipment\.body is not supported/);

  assert.throws(() => extract(`
    portableDsl(game => {
      game.state("ready", 1);
      game.actor("hero", { x: 0, y: 80, z: 0, hiddenLayers: ["hat", "hat"] });
      game.tick(() => {});
    });
  `), /unsupported or duplicate layer/);
});
