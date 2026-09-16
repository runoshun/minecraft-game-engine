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
const HEAD_TEXTURE = "https://textures.minecraft.net/texture/fa1a7795581e6ffde1cd49edb9f50b37b8b7ffa5a8245c1a7284404f5cbd6bfc";

function extract(source) {
  const js = transpileTypeScript("placeable-test.ts", source, root);
  return parseProgram(extractPortableSpec("placeable-test.ts", js, root));
}

function compileSource(source, namespace = "portable_placeable_test") {
  const program = extract(source);
  const output = fs.mkdtempSync(path.join(os.tmpdir(), "mcgame-placeable-"));
  const result = compileDatapack(program, namespace, output);
  return { program, output, result };
}

function read(output, relative) { return fs.readFileSync(path.join(output, relative), "utf8"); }
function functionFiles(output, namespace) {
  const dir = path.join(output, "data", namespace, "function", "portable");
  return fs.readdirSync(dir).filter(name => name.endsWith(".mcfunction")).map(name => ({ name, text: fs.readFileSync(path.join(dir, name), "utf8") }));
}

const ownership = `{ dimension: "minecraft:overworld", minX: 720, minZ: 720, maxX: 760, maxZ: 760 }`;

test("v25 DSL lowers head-looking placement carriers into independent bounded world objects", () => {
  const { program, output, result } = compileSource(`
    portableDsl({ fixedPoint: 1000, ownership: ${ownership} }, game => {
      const item = game.item("cabinet_item", {
        name: "Pinball Machine",
        appearance: { kind: "head", textureUrl: "${HEAD_TEXTURE}" },
        maxStackSize: 1,
      });
      const players = game.players();
      game.placeable("cabinet", { item, maxInstances: 2, orientation: "cardinal" }, table => {
        const uses = table.state("uses", 0);
        const ballX = table.state("ballX", 0.25);
        table.block("body", { block: "minecraft:polished_blackstone", x: ballX, y: 0.5, z: 0.5, scale: { x: 1.5, y: 1, z: 1 } });
        table.text("label", { text: ["USES ", uses], x: 0, y: 2, z: 0, scale: 0.7 });
        table.itemDisplay("icon", { item, x: 0, y: 1.2, z: -0.2, scale: 0.5 });
        const controls = table.interaction("controls", { x: 0, y: 0.2, z: 0.6, width: 1.5, height: 1.5 });
        table.tick(() => {
          controls.onUse(player => { controls.controller.claim(player); uses.add(1); });
          controls.controller.forPlayer(player => {
            game.when(player.input.jump.eq(1), () => ballX.add(0.1));
            game.when(player.input.sneak.eq(1), () => table.pickUp(player));
          });
        });
      });
      game.tick(() => game.forSinglePlayer(players, player => {
        const given = player.state("given", 0);
        game.when(given.eq(0), () => { item.give(player); given.set(1); });
      }));
    });
  `);

  assert.equal(program.version, 25);
  assert.equal(program.items.length, 1);
  assert.equal(program.placeables.length, 1);
  assert.equal(program.placeables[0].maxInstances, 2);
  assert.equal(program.projections.length, 2);
  assert.equal(program.texts.length, 2);
  assert.equal(program.itemDisplays.length, 2);
  assert.equal(program.interactions.length, 2);
  assert.equal(result.placeableSlotCount, 2);
  assert.equal(result.itemDisplayCount, 2);

  const tick = read(output, "data/portable_placeable_test/function/portable/tick.mcfunction");
  const marker = read(output, ".mcgame-portable-generated");
  const functions = functionFiles(output, "portable_placeable_test");
  const all = functions.map(value => value.text).join("\n");
  const itemDisplay = functions.find(value => value.text.includes("summon minecraft:item_display"));
  assert(itemDisplay, "expected generated placeable item_display spawn function");

  assert.match(marker, /portable_version=25/);
  assert.match(marker, /item\.cabinet_item\.appearance=head/);
  assert.match(marker, /placeable\.cabinet\.item=cabinet_item;slots=2/);
  assert.match(tick, /tag=mcg_pp_[a-z0-9]+_cabinet/);
  assert.match(tick, /at @s if dimension minecraft:overworld run function portable_placeable_test:portable\/placeable_cabinet_allocate/);
  assert.match(tick, /at @s if dimension minecraft:the_nether run function portable_placeable_test:portable\/placeable_cabinet_reject/);
  assert.match(all, /give @s minecraft:armor_stand\[/);
  assert.match(all, /minecraft:entity_data=.*Marker:1b/);
  assert.match(all, /summon minecraft:item_display/);
  assert.match(itemDisplay.text, /minecraft:item_model/);
  assert.match(itemDisplay.text, /minecraft:profile/);
  assert.doesNotMatch(itemDisplay.text, /minecraft:entity_data/);
  assert.match(all, /scoreboard players operation #v\d+ .* = #px00/);
  assert.match(all, /transformation\.left_rotation set value \[0f,-0\.7071068f,0f,0\.7071068f\]/);
});

test("v25 item/placeable parser rejects old versions missing ownership and component escape hatches", () => {
  const item = { id: "cabinet_item", name: "Cabinet", appearance: { kind: "model", model: "minecraft:armor_stand" }, maxStackSize: 1 };
  const placeable = { id: "cabinet", item: "cabinet_item", maxInstances: 1, orientation: "cardinal", state: { uses: 0 } };
  const base = { version: 25, state: {}, items: [item], placeables: [placeable], tick: [], vanilla: { ownership: { dimension: "minecraft:overworld", minX: 0, minZ: 0, maxX: 16, maxZ: 16 } } };

  assert.throws(() => parseProgram({ ...base, version: 24 }), /items requires portable version 25/);
  assert.throws(() => parseProgram({ ...base, vanilla: {} }), /placeables requires vanilla\.ownership/);
  assert.throws(() => parseProgram({ ...base, items: [{ ...item, customData: { bad: 1 } }] }), /customData is not supported/);
  assert.throws(() => parseProgram({ ...base, items: [{ ...item, appearance: { kind: "head", textureUrl: "https://example.com/x", nbt: "bad" } }] }), /appearance\.nbt is not supported|textureUrl/);
  assert.throws(() => parseProgram({ ...base, placeables: [{ ...placeable, command: "say nope" }] }), /command is not supported/);
  assert.throws(() => parseProgram({ ...base, placeables: [{ ...placeable, maxInstances: 17 }] }), /must be between 1 and 16/);

  const noPlaceables = structuredClone(base);
  delete noPlaceables.placeables;
  assert.throws(() => parseProgram(noPlaceables), /must each be bound to exactly one placeable type/);

  assert.throws(() => extract(`
    portableDsl({ ownership: ${ownership} }, game => {
      game.item("orphan", { name: "Orphan", appearance: { kind: "model", model: "minecraft:armor_stand" } });
      const marker = game.state("marker", 0);
      game.tick(() => marker.set(1));
    });
  `), /every item\(\.\.\.\) must be bound to exactly one placeable/);
});

test("v25 lexical placeable state cannot escape and compile-time pools stay bounded", () => {
  assert.throws(() => extract(`
    portableDsl({ ownership: ${ownership} }, game => {
      const item = game.item("cab", { name: "Cab", appearance: { kind: "model", model: "minecraft:armor_stand" } });
      let escaped;
      game.placeable("cabinet", { item, maxInstances: 1 }, table => { escaped = table.state("x", 0); });
      game.tick(() => game.when(escaped.eq(0), () => {}));
    });
  `), /escaped its PlaceableInstanceContext/);

  assert.throws(() => extract(`
    portableDsl({ ownership: ${ownership} }, game => {
      const item = game.item("cab", { name: "Cab", appearance: { kind: "model", model: "minecraft:armor_stand" } });
      game.placeable("cabinet", { item, maxInstances: 1 }, table => {
        for (let i = 0; i < 17; i++) table.state("s" + i, 0);
      });
      game.tick(() => {});
    });
  `), /at most 16 state fields/);

  assert.throws(() => extract(`
    portableDsl({ ownership: ${ownership} }, game => {
      const a = game.item("a", { name: "A", appearance: { kind: "model", model: "minecraft:armor_stand" } });
      const b = game.item("b", { name: "B", appearance: { kind: "model", model: "minecraft:armor_stand" } });
      const c = game.item("c", { name: "C", appearance: { kind: "model", model: "minecraft:armor_stand" } });
      game.placeable("pa", { item: a, maxInstances: 16 }, () => {});
      game.placeable("pb", { item: b, maxInstances: 16 }, () => {});
      game.placeable("pc", { item: c, maxInstances: 1 }, () => {});
      game.tick(() => {});
    });
  `), /at most 32 aggregate placeable slots/);

  assert.throws(() => extract(`
    portableDsl({ ownership: ${ownership} }, game => {
      const item = game.item("cab", { name: "Cab", appearance: { kind: "model", model: "minecraft:armor_stand" } });
      game.placeable("cabinet", { item, maxInstances: 16 }, table => {
        for (let i = 0; i < 17; i++) table.block("b" + i, { block: "minecraft:stone", x: i, y: 0, z: 0 });
      });
      game.tick(() => {});
    });
  `), /at most 256 expanded placeable child presentation declarations/);
});

test("v25 raw IR validates placeable-scoped item displays and local state references", () => {
  const spec = {
    version: 25,
    fixedPoint: 1000,
    state: {},
    items: [{ id: "cab_item", name: "Cab", appearance: { kind: "model", model: "minecraft:armor_stand" }, maxStackSize: 1 }],
    placeables: [{ id: "cab", item: "cab_item", maxInstances: 1, state: { x: 0 } }],
    tick: [{ op: "placeable_tick", placeable: "cab", slot: 0, actions: [{ op: "placeable_add", placeable: "cab", slot: 0, target: "x", value: 1 }] }],
    vanilla: {
      ownership: { dimension: "minecraft:overworld", minX: 0, minZ: 0, maxX: 16, maxZ: 16 },
      itemDisplays: [{ id: "icon", item: "cab_item", x: { placeableState: { placeable: "cab", slot: 0, state: "x" } }, y: 1, z: 0, placeable: { id: "cab", slot: 0 } }],
    },
  };
  const parsed = parseProgram(spec);
  assert.equal(parsed.itemDisplays.length, 1);
  assert.equal(parsed.itemDisplays[0].placeable.id, "cab");
  assert.equal(parsed.itemDisplays[0].placeable.x.kind, "placeable_state");

  const noBinding = structuredClone(spec);
  delete noBinding.vanilla.itemDisplays[0].placeable;
  assert.throws(() => parseProgram(noBinding), /placeable is required/);

  const badItem = structuredClone(spec);
  badItem.vanilla.itemDisplays[0].item = "missing";
  assert.throws(() => parseProgram(badItem), /unknown item missing/);
});

test("v25 pickup invalidates the slot controller before reuse and returns the same carrier item", () => {
  const { output } = compileSource(`
    portableDsl({ fixedPoint: 1000, ownership: ${ownership} }, game => {
      const item = game.item("cabinet_item", { name: "Cabinet", appearance: { kind: "model", model: "minecraft:armor_stand" } });
      game.placeable("cabinet", { item, maxInstances: 1 }, table => {
        const use = table.interaction("use", { x: 0, y: 0, z: 0, width: 1, height: 1 });
        table.tick(() => {
          use.onUse(player => use.controller.claim(player));
          use.controller.forPlayer(player => game.when(player.input.sneak.eq(1), () => table.pickUp(player)));
        });
      });
      game.tick(() => {});
    });
  `, "portable_placeable_pickup");
  const all = functionFiles(output, "portable_placeable_pickup").map(value => value.text).join("\n");
  const advances = all.match(/scoreboard players add #ic00 mcg[a-f0-9]{8} 1/g) ?? [];
  assert(advances.length >= 3, "claim, pickup removal, and slot allocation should each advance controller generation");
  assert.match(all, /give @s minecraft:armor_stand\[/);
  assert.match(all, /scoreboard players set #pa00 mcg[a-f0-9]{8} 0/);
  assert.match(all, /kill @e\[type=minecraft:armor_stand,tag=mcg_pa_[a-z0-9]+_cabinet_00\]/);
});
