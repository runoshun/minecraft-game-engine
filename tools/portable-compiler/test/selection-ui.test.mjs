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

function compileSource(source, namespace = "portable_v20_selection") {
  const program = extract(source);
  const output = fs.mkdtempSync(path.join(os.tmpdir(), "mcgame-v20-selection-"));
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

test("v20 selection UI lowers to trigger objectives and generated vanilla dialogs", () => {
  const { program, output, result } = compileSource(`
    portableDsl({ fixedPoint: 1000 }, game => {
      const players = game.teamPlayers("v20_party");
      const shop = game.selection("shop", {
        title: "Shop",
        body: "Choose an item",
        columns: 2,
        options: [
          { label: "Potion", tooltip: "Costs 5G", value: 1 },
          { label: "Sword", value: 2.5 },
        ],
        cancel: { label: "Leave", value: -1 },
      });
      game.tick(() => {
        game.forEachPlayer(players, player => {
          const choice = player.selection(shop);
          const seen = player.state("seen", 0);
          choice.open();
          game.when(choice.eq(1), () => { seen.set(choice); choice.clear(); });
          game.when(choice.eq(-1), () => { seen.set(choice); choice.clear(); });
          player.hud("choice", { text: ["CHOICE ", choice, " SEEN ", seen] });
        });
      });
    });
  `);

  assert.equal(program.version, 20);
  assert.equal(result.selectionCount, 1);
  assert.equal(program.selections[0].options[0].raw, 1000);
  assert.equal(program.selections[0].options[1].raw, 2500);
  assert.equal(program.selections[0].cancel.raw, -1000);

  const marker = markerMap(output);
  const objective = marker["selection.shop"];
  assert.match(objective, /^mui[0-9a-f]{8}00$/);

  const load = read(output, "data/portable_v20_selection/function/portable/load.mcfunction");
  assert.match(load, new RegExp(`scoreboard objectives add ${objective} trigger`));
  const init = read(output, "data/portable_v20_selection/function/portable/player_init.mcfunction");
  assert.match(init, new RegExp(`scoreboard players set @s ${objective} -2147483648`));

  const dialog = JSON.parse(read(output, "data/portable_v20_selection/dialog/portable/selection/shop.json"));
  assert.equal(dialog.type, "minecraft:multi_action");
  assert.equal(dialog.title, "Shop");
  assert.equal(dialog.pause, false);
  assert.equal(dialog.after_action, "close");
  assert.equal(dialog.columns, 2);
  assert.equal(dialog.body[0].contents, "Choose an item");
  assert.deepEqual(dialog.actions[0], {
    label: "Potion",
    tooltip: "Costs 5G",
    action: { type: "minecraft:run_command", command: `trigger ${objective} set 1000` },
  });
  assert.equal(dialog.actions[1].action.command, `trigger ${objective} set 2500`);
  assert.equal(dialog.exit_action.action.command, `trigger ${objective} set -1000`);

  const open = read(output, "data/portable_v20_selection/function/portable/selection_shop_open.mcfunction");
  assert.match(open, new RegExp(`scoreboard players set @s ${objective} 0`));
  assert.match(open, new RegExp(`scoreboard players enable @s ${objective}`));
  assert.match(open, /dialog show @s portable_v20_selection:portable\/selection\/shop/);

  const playerFn = read(output, "data/portable_v20_selection/function/portable/player_000.mcfunction");
  assert.match(playerFn, new RegExp(`execute if score @s ${objective} matches -2147483648 run function portable_v20_selection:portable/selection_shop_open`));
  const branches = read(output, "data/portable_v20_selection/function/portable/branch_000.mcfunction") + read(output, "data/portable_v20_selection/function/portable/branch_001.mcfunction");
  assert.match(branches, new RegExp(`execute if score @s ${objective} matches 0 run dialog clear @s`));
  assert.match(branches, new RegExp(`scoreboard players set @s ${objective} -2147483648`));

  const cleanup = read(output, "data/portable_v20_selection/function/portable/cleanup.mcfunction");
  assert.match(cleanup, new RegExp(`execute as @a if score @s ${objective} matches 0 run dialog clear @s`));
  assert.match(cleanup, /scoreboard objectives remove mui[0-9a-f]{8}07/);
});

test("v20 selection objective slots are declaration-order independent and opening replaces other pending selection", () => {
  const source = order => `
    portableDsl(game => {
      const players = game.players();
      ${order.map(id => `const ${id} = game.selection("${id}", { title: "${id}", options: [{ label: "OK", value: ${id === "alpha" ? 1 : 2} }] });`).join("\n")}
      game.tick(() => game.forEachPlayer(players, player => {
        const a = player.selection(alpha);
        const b = player.selection(beta);
        a.open();
        b.open();
      }));
    });
  `;
  const a = compileSource(source(["alpha", "beta"]), "portable_v20_order");
  const b = compileSource(source(["beta", "alpha"]), "portable_v20_order");
  assert.equal(markerMap(a.output)["selection.alpha"], markerMap(b.output)["selection.alpha"]);
  assert.equal(markerMap(a.output)["selection.beta"], markerMap(b.output)["selection.beta"]);
  const marker = markerMap(a.output);
  const alpha = marker["selection.alpha"], beta = marker["selection.beta"];
  const betaOpen = read(a.output, "data/portable_v20_order/function/portable/selection_beta_open.mcfunction");
  assert.match(betaOpen, new RegExp(`execute if score @s ${alpha} matches 0 run scoreboard players set @s ${alpha} -2147483648`));
  assert.match(betaOpen, new RegExp(`scoreboard players set @s ${beta} 0`));
});

test("v20 selection validation rejects old versions, reserved results, bounds, and scope escapes", () => {
  assert.throws(() => parseProgram({
    version: 19, state: {}, selections: [{ id: "menu", title: "Menu", options: [{ label: "OK", value: 1 }] }], tick: [],
  }), /selections requires portable version 20/);

  assert.throws(() => extract(`
    portableDsl(game => {
      game.selection("bad", { title: "Bad", options: [{ label: "Zero", value: 0 }] });
      game.tick(() => {});
    });
  `), /reserved or duplicate raw result 0/);

  assert.throws(() => extract(`
    portableDsl(game => {
      game.selection("bad", { title: "Bad", options: [{ label: "A", value: 1 }, { label: "B", value: 1.0001 }] });
      game.tick(() => {});
    });
  `), /reserved or duplicate raw result 1000/);

  assert.throws(() => extract(`
    portableDsl(game => {
      ${Array.from({ length: 9 }, (_, i) => `game.selection("m${i}", { title: "M${i}", options: [{ label: "OK", value: ${i + 1} }] });`).join("\n")}
      game.tick(() => {});
    });
  `), /at most 8 selections/);

  assert.throws(() => parseProgram({
    version: 20,
    state: {},
    selections: [{ id: "menu", title: "Menu", options: [{ label: "OK", value: 1 }] }],
    tick: [{ op: "selection_open", selection: "menu" }],
  }), /only valid in mutable PlayerContext/);

  assert.throws(() => extract(`
    portableDsl(game => {
      const menu = game.selection("menu", { title: "Menu", options: [{ label: "OK", value: 1 }] });
      const players = game.players();
      let escaped;
      game.tick(() => {
        game.forEachPlayer(players, player => { escaped = player.selection(menu); });
        game.when(escaped.eq(1), () => {});
      });
    });
  `), /player selection reference escaped its PlayerContext/);
});
