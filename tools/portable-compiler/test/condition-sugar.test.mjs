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

function extractSpec(source) {
  const js = transpileTypeScript("condition-sugar-test.ts", source, root);
  return extractPortableSpec("condition-sugar-test.ts", js, root);
}

function extract(source) {
  return parseProgram(extractSpec(source));
}

test("v27 compound conditions are explicit IR nodes and replace whenAll/whenAny", () => {
  const spec = extractSpec(`
    portableDsl(game => {
      const a = game.state("a", 0);
      const b = game.state("b", 0);
      const c = game.state("c", 0);
      const out = game.state("out", 0);
      const visible = game.condition.all([
        a.eq(1),
        game.condition.any([b.eq(2), game.condition.not(c.eq(3))]),
      ]);
      game.text("status", { text: "READY", x: 0, y: 64, z: 0, when: visible });
      game.tick(() => game.when(visible, () => out.set(1), () => out.set(2)));
    });
  `);

  assert.equal(spec.version, 27);
  assert.equal(spec.tick[0].condition.op, "all");
  assert.equal(spec.tick[0].condition.conditions[1].op, "any");
  assert.equal(spec.tick[0].condition.conditions[1].conditions[1].op, "not");
  assert.equal(spec.vanilla.texts[0].when.op, "all");

  const program = parseProgram(spec);
  assert.equal(program.version, 27);
  assert.equal(program.tickActions[0].condition.op, "all");

  assert.throws(() => extractSpec(`
    portableDsl(game => {
      const a = game.state("a", 0);
      game.tick(() => (game as any).whenAll([a.eq(1)], () => a.set(2)));
    });
  `), /whenAll is not a function/);

  assert.throws(() => extractSpec(`
    portableDsl(game => {
      const a = game.state("a", 0);
      game.tick(() => (game as any).whenAny([a.eq(1)], () => a.set(2)));
    });
  `), /whenAny is not a function/);
});

test("unless choose and match remain authoring-only ordered branches", () => {
  const spec = extractSpec(`
    portableDsl(game => {
      const a = game.state("a", 0);
      const phase = game.state("phase", 1);
      const out = game.state("out", 0);
      game.tick(() => {
        game.unless(a.eq(5), () => out.set(30), () => out.set(-30));
        game.choose([
          { when: phase.eq(1), then: () => { out.set(1); phase.set(2); } },
          { when: phase.eq(2), then: () => out.set(2) },
        ]);
        game.match(phase, [
          [2, () => { out.set(3); phase.set(3); }],
          [3, () => out.set(4)],
        ]);
      });
    });
  `);

  assert.ok(spec.version < 27);
  assert.equal(spec.tick[0].then[0].value, -30);
  assert.equal(spec.tick[0].else[0].value, 30);
  assert.equal(spec.tick[1].then[1].target, "phase");
  assert.equal(spec.tick[1].else[0].condition.right, 2);
  assert.equal(spec.tick[2].then[1].target, "phase");
  assert.equal(spec.tick[2].else[0].condition.right, 3);
  parseProgram(spec);
});

test("compound conditions preserve lexical PlayerContext checks", () => {
  assert.throws(() => extract(`
    portableDsl(game => {
      const players = game.players();
      const out = game.state("out", 0);
      let escaped;
      game.tick(() => {
        game.forSinglePlayer(players, player => { escaped = player.input.left.eq(1); });
        const combined = game.condition.all([escaped, out.eq(0)]);
        game.when(combined, () => out.set(1));
      });
    });
  `), /condition\.all condition 0 escaped its PlayerContext/);

  const program = extract(`
    portableDsl(game => {
      const players = game.players();
      game.tick(() => {
        game.forEachPlayer(players, player => {
          const hp = player.state("hp", 1);
          const aliveAndMoving = game.condition.all([
            hp.gt(0),
            game.condition.any([player.input.left.eq(1), player.input.right.eq(1)]),
          ]);
          game.when(aliveAndMoving, () => hp.add(1));
        });
      });
    });
  `);
  assert.equal(program.version, 27);
});

test("compound condition DSL and raw IR enforce version and structural bounds", () => {
  assert.throws(() => extractSpec(`
    portableDsl(game => {
      const out = game.state("out", 0);
      game.condition.all([]);
      game.tick(() => out.set(1));
    });
  `), /condition\.all conditions must contain 1\.\.16 entries/);

  assert.throws(() => parseProgram({
    version: 26,
    fixedPoint: 1000,
    state: { a: 0, out: 0 },
    tick: [{
      op: "if",
      condition: { op: "all", conditions: [{ op: "eq", left: { state: "a" }, right: 0 }] },
      then: [{ op: "set", target: "out", value: 1 }],
    }],
  }), /requires portable version 27/);

  const tooWide = Array.from({ length: 17 }, () => ({ op: "eq", left: { state: "a" }, right: 0 }));
  assert.throws(() => parseProgram({
    version: 27,
    fixedPoint: 1000,
    state: { a: 0, out: 0 },
    tick: [{
      op: "if",
      condition: { op: "all", conditions: tooWide },
      then: [{ op: "set", target: "out", value: 1 }],
    }],
  }), /conditions must contain 1\.\.16 entries/);
});

test("compound conditions lower through boolean evaluator functions without branch-body duplication", () => {
  const program = extract(`
    portableDsl(game => {
      const a = game.state("a", 0);
      const b = game.state("b", 0);
      const c = game.state("c", 0);
      const out = game.state("out", 0);
      const players = game.players();
      game.tick(() => {
        game.when(game.condition.any([a.eq(1), b.eq(2), c.eq(3)]), () => {
          out.add(1);
          out.add(2);
          out.add(3);
        });
        game.reduce.any(players, out, player => game.condition.all([
          player.input.left.eq(1),
          game.condition.not(player.input.sneak.eq(1)),
        ]));
      });
    });
  `);
  const output = fs.mkdtempSync(path.join(os.tmpdir(), "mcgame-v27-condition-"));
  compileDatapack(program, "portable_v27_condition", output);
  const portableDir = path.join(output, "data/portable_v27_condition/function/portable");
  const files = fs.readdirSync(portableDir);
  const conditionFiles = files.filter(name => name.startsWith("condition_"));
  assert.ok(conditionFiles.length >= 2);

  const allBodies = files.filter(name => name.endsWith(".mcfunction"))
    .map(name => fs.readFileSync(path.join(portableDir, name), "utf8")).join("\n");
  assert.match(allBodies, /execute store result score #k\d+ .* run function portable_v27_condition:portable\/condition_/);
  assert.match(allBodies, /execute as @a store result score @s .* run function portable_v27_condition:portable\/condition_/);

  const addOneOccurrences = (allBodies.match(/scoreboard players operation #out .* \+= .*#c/g) || []).length;
  assert.ok(addOneOccurrences <= 3, "guarded body should not be copied once per OR alternative");
});

test("if/else lowering snapshots branch choice before a branch can mutate its condition", () => {
  const program = extract(`
    portableDsl(game => {
      const phase = game.state("phase", 1);
      const out = game.state("out", 0);
      game.tick(() => {
        game.when(phase.eq(1), () => { phase.set(2); out.set(10); }, () => out.set(20));
      });
    });
  `);
  const output = fs.mkdtempSync(path.join(os.tmpdir(), "mcgame-if-dispatch-"));
  compileDatapack(program, "portable_if_dispatch", output);
  const portableDir = path.join(output, "data/portable_if_dispatch/function/portable");
  const branchFiles = fs.readdirSync(portableDir).filter(name => name.startsWith("branch_") && name.endsWith(".mcfunction"));
  const bodies = branchFiles.map(name => fs.readFileSync(path.join(portableDir, name), "utf8"));
  const dispatch = bodies.find(body => body.includes("return run function portable_if_dispatch:portable/branch_"));
  assert.ok(dispatch, "expected an exclusive if/else dispatch function");
  assert.match(dispatch, /execute if score .* run return run function portable_if_dispatch:portable\/branch_/);
  assert.match(dispatch, /\nreturn run function portable_if_dispatch:portable\/branch_/);

  const tick = fs.readFileSync(path.join(portableDir, "tick.mcfunction"), "utf8");
  assert.doesNotMatch(tick, /execute unless score .* run function portable_if_dispatch:portable\/branch_/);
});
