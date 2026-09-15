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
function compileSource(source, namespace = "portable_v21_dialog") {
  const program = extract(source), output = fs.mkdtempSync(path.join(os.tmpdir(), "mcgame-v21-dialog-"));
  const result = compileDatapack(program, namespace, output);
  return { program, output, result };
}
function read(output, relative) { return fs.readFileSync(path.join(output, relative), "utf8"); }
function markerMap(output) {
  return Object.fromEntries(read(output, ".mcgame-portable-generated").trim().split("\n").map(line => {
    const index = line.indexOf("="); return [line.slice(0, index), line.slice(index + 1)];
  }));
}
function functionsText(output, namespace) {
  const dir = path.join(output, "data", namespace, "function", "portable");
  return fs.readdirSync(dir).filter(name => name.endsWith(".mcfunction")).sort().map(name => read(output, `data/${namespace}/function/portable/${name}`)).join("\n");
}

const richSource = `
portableDsl({ fixedPoint: 1000 }, game => {
  const players = game.teamPlayers("v21_party");
  const shop = game.selection("shop", {
    title: [{ text: "Arcane ", color: "aqua" }, { text: "Shop", bold: true }],
    body: [
      { type: "text", text: [{ text: "Gold ", color: "gray" }, { text: "12", color: "yellow", bold: true }], width: 280 },
      { type: "item", item: "minecraft:diamond_sword", count: 1, description: { text: "Hero Blade", color: "gold" }, showTooltip: true, showDecoration: true, width: 32, height: 32 },
    ],
    options: [{ label: { text: "Potion", color: "green" }, tooltip: { text: "5 Gold", italic: true }, value: 1 }],
    cancel: { label: { text: "Leave", color: "red" }, tooltip: { text: "Close shop", italic: true }, value: -1 },
  });
  const confirm = game.confirmation("confirm", {
    title: { text: "Buy Sword?", color: "gold", bold: true },
    body: [{ type: "item", item: "minecraft:diamond_sword", description: "12 Gold", width: 32, height: 32 }],
    yes: { label: { text: "Buy", color: "green" }, value: 10 },
    no: { label: { text: "No", color: "red" }, value: -10 },
  });
  const toggle = game.form("toggle", { title: "Enabled?", input: { type: "boolean", label: "Enabled", initial: true, trueValue: 1, falseValue: 0 } });
  const klass = game.form("klass", { title: "Class", input: { type: "option", label: "Choose class", options: [{ label: { text: "Mage", color: "aqua" }, value: 3 }, { label: "Warrior", value: 7 }], initial: 7 } });
  const amount = game.form("amount", { title: "Amount", input: { type: "range", label: "Quantity", start: 1, end: 9, step: 2, initial: 3 }, cancel: { value: -1 } });
  game.tick(() => {
    game.forEachPlayer(players, player => {
      const s = player.selection(shop); const c = player.selection(confirm);
      const b = player.form(toggle); const o = player.form(klass); const r = player.form(amount);
      s.open(); c.open(); b.open(); o.open(); r.open();
      game.when(c.eq(10), () => c.clear());
      game.when(b.eq(0), () => b.clear());
      game.when(o.eq(7), () => o.clear());
      game.when(r.eq(3), () => r.clear());
    });
  });
});`;

test("v21 rich dialog body, item presentation, and confirmation lower to native dialog resources", () => {
  const { program, output, result } = compileSource(richSource);
  assert.equal(program.version, 21);
  assert.equal(result.selectionCount, 2);
  assert.equal(result.formCount, 3);

  const shop = JSON.parse(read(output, "data/portable_v21_dialog/dialog/portable/selection/shop.json"));
  assert.equal(shop.type, "minecraft:multi_action");
  assert.deepEqual(shop.title[0], { text: "Arcane ", color: "aqua" });
  assert.deepEqual(shop.title[1], { text: "Shop", bold: true });
  assert.equal(shop.body[0].type, "minecraft:plain_message");
  assert.equal(shop.body[0].width, 280);
  assert.equal(shop.body[1].type, "minecraft:item");
  assert.deepEqual(shop.body[1].item, { id: "minecraft:diamond_sword", count: 1 });
  assert.deepEqual(shop.body[1].description.contents, { text: "Hero Blade", color: "gold" });
  assert.equal(shop.body[1].show_tooltip, true);
  assert.equal(shop.body[1].show_decoration, true);
  assert.deepEqual(shop.actions[0].label, { text: "Potion", color: "green" });
  assert.deepEqual(shop.actions[0].tooltip, { text: "5 Gold", italic: true });
  assert.deepEqual(shop.exit_action.tooltip, { text: "Close shop", italic: true });

  const confirm = JSON.parse(read(output, "data/portable_v21_dialog/dialog/portable/selection/confirm.json"));
  assert.equal(confirm.type, "minecraft:confirmation");
  assert.deepEqual(confirm.title, { text: "Buy Sword?", color: "gold", bold: true });
  assert.deepEqual(confirm.yes.label, { text: "Buy", color: "green" });
  assert.deepEqual(confirm.no.label, { text: "No", color: "red" });
  assert.match(confirm.yes.action.command, / set 10000$/);
  assert.match(confirm.no.action.command, / set -10000$/);
});

test("v21 boolean option and integer range forms use stable trigger transport and fixed-point result objectives", () => {
  const { output } = compileSource(richSource, "portable_v21_forms");
  const marker = markerMap(output);
  for (const id of ["amount", "klass", "toggle"]) {
    assert.match(marker[`form.${id}.transport`], /^muf[0-9a-f]{8}0[0-2];result=mur[0-9a-f]{8}0[0-2]$/);
  }
  const toggle = marker["form.toggle.transport"].split(";result=");
  const klass = marker["form.klass.transport"].split(";result=");
  const amount = marker["form.amount.transport"].split(";result=");

  const boolDialog = JSON.parse(read(output, "data/portable_v21_forms/dialog/portable/form/toggle.json"));
  assert.deepEqual(boolDialog.inputs[0], { type: "minecraft:boolean", key: "v", label: "Enabled", initial: true, on_true: "1", on_false: "0" });
  assert.equal(boolDialog.actions[0].action.type, "minecraft:dynamic/run_command");
  assert.equal(boolDialog.actions[0].action.template, `trigger ${toggle[0]} set $(v)`);

  const optionDialog = JSON.parse(read(output, "data/portable_v21_forms/dialog/portable/form/klass.json"));
  assert.equal(optionDialog.inputs[0].type, "minecraft:single_option");
  assert.deepEqual(optionDialog.inputs[0].options[0], { id: "0", display: { text: "Mage", color: "aqua" } });
  assert.deepEqual(optionDialog.inputs[0].options[1], { id: "1", display: "Warrior", initial: true });

  const rangeDialog = JSON.parse(read(output, "data/portable_v21_forms/dialog/portable/form/amount.json"));
  assert.deepEqual(rangeDialog.inputs[0], { type: "minecraft:number_range", key: "v", label: "Quantity", width: 200, start: 1, end: 9, step: 2, initial: 3 });
  assert.equal(rangeDialog.exit_action.action.command, `trigger ${amount[0]} set 2147483647`);

  const functions = functionsText(output, "portable_v21_forms");
  assert.match(functions, new RegExp(`matches 0 run scoreboard players set @s ${toggle[1]} 0`));
  assert.match(functions, new RegExp(`matches 1 run scoreboard players set @s ${toggle[1]} 1000`));
  assert.match(functions, new RegExp(`matches 0 run scoreboard players set @s ${klass[1]} 3000`));
  assert.match(functions, new RegExp(`matches 1 run scoreboard players set @s ${klass[1]} 7000`));
  assert.match(functions, /#form_step/);
  assert.match(functions, new RegExp(`scoreboard players operation @s ${amount[1]} = @s ${amount[0]}`));
  assert.match(functions, new RegExp(`scoreboard players operation @s ${amount[1]} \\*= #c\\d+`));

  const cleanup = read(output, "data/portable_v21_forms/function/portable/cleanup.mcfunction");
  assert.match(cleanup, /scoreboard objectives remove muf[0-9a-f]{8}07/);
  assert.match(cleanup, /scoreboard objectives remove mur[0-9a-f]{8}07/);
});

test("v21 dialog form objective slots are declaration-order independent and dialog surfaces replace pending peers", () => {
  const source = order => `portableDsl(game => {
    const p = game.players();
    ${order.map(id => `const ${id} = game.form("${id}", { title: "${id}", input: { type: "boolean", label: "${id}" } });`).join("\n")}
    const menu = game.selection("menu", { title: [{text:"Menu",bold:true}], options: [{label:"OK",value:1}] });
    game.tick(() => game.forEachPlayer(p, player => { const a=player.form(alpha); const b=player.form(beta); const m=player.selection(menu); a.open(); b.open(); m.open(); }));
  });`;
  const a = compileSource(source(["alpha", "beta"]), "portable_v21_order");
  const b = compileSource(source(["beta", "alpha"]), "portable_v21_order");
  for (const id of ["alpha", "beta"]) assert.equal(markerMap(a.output)[`form.${id}.transport`], markerMap(b.output)[`form.${id}.transport`]);

  const marker = markerMap(a.output), alpha = marker["form.alpha.transport"].split(";result="), menu = marker["selection.menu"];
  const betaOpen = read(a.output, "data/portable_v21_order/function/portable/form_beta_open.mcfunction");
  assert.match(betaOpen, new RegExp(`if score @s ${alpha[1]} matches -2147483648 if score @s ${alpha[0]} matches -2147483647 run scoreboard players set @s ${alpha[0]} -2147483648`));
  const menuOpen = read(a.output, "data/portable_v21_order/function/portable/selection_menu_open.mcfunction");
  assert.match(menuOpen, /muf[0-9a-f]{8}0[01].*-2147483648/);
  assert.match(menuOpen, new RegExp(`scoreboard players set @s ${menu} 0`));
});

test("v21 validation rejects nonportable text input and unsafe or unbounded dialog structures", () => {
  assert.throws(() => parseProgram({ version: 20, state: {}, forms: [{ id: "f", title: "F", input: { type: "boolean", label: "B" } }], tick: [] }), /forms requires portable version 21/);
  assert.throws(() => extract(`portableDsl(game => { game.form("name", { title: "Name", input: { type: "text", label: "Name" } }); game.tick(()=>{}); });`), /text input is not portable in v21/);
  assert.throws(() => extract(`portableDsl(game => { game.confirmation("bad", { title: { text: "X", clickEvent: { action: "run_command", command: "/say x" } } }); game.tick(()=>{}); });`), /clickEvent is not supported/);
  assert.throws(() => extract(`portableDsl(game => { game.selection("bad", { title: [{text:"X",color:"not_a_color"}], options:[{label:"OK",value:1}] }); game.tick(()=>{}); });`), /standard Minecraft color/);
  assert.throws(() => extract(`portableDsl(game => { ${Array.from({length:9},(_,i)=>`game.form("f${i}",{title:"F",input:{type:"boolean",label:"B"}});`).join(" ")} game.tick(()=>{}); });`), /at most 8 forms/);
  assert.throws(() => extract(`portableDsl(game => { game.form("f", { title:"F", input:{type:"option",label:"O",options:[${Array.from({length:17},(_,i)=>`{label:"${i}",value:${i}}`).join(",")}]}}); game.tick(()=>{}); });`), /1\.\.16 options/);

  assert.throws(() => extract(`portableDsl(game => { const f=game.form("f",{title:"F",input:{type:"boolean",label:"B"}}); const p=game.players(); let escaped; game.tick(()=>{ game.forEachPlayer(p, player=>{ escaped=player.form(f); }); game.when(escaped.eq(1),()=>{}); }); });`), /player form reference escaped its PlayerContext/);
});
