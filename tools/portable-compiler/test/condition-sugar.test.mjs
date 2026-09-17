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

test("condition authoring sugar expands to existing ordered if actions without raising Portable IR version", () => {
  const baseline = extractSpec(`
    portableDsl(game => {
      const a = game.state("a", 0);
      const out = game.state("out", 0);
      game.tick(() => game.when(a.eq(1), () => out.set(1)));
    });
  `);
  const spec = extractSpec(`
    portableDsl(game => {
      const a = game.state("a", 0);
      const b = game.state("b", 0);
      const phase = game.state("phase", 0);
      const out = game.state("out", 0);
      game.tick(() => {
        game.whenAll([a.eq(1), b.eq(2)], () => out.set(10), () => out.set(-10));
        game.whenAny([a.eq(3), b.eq(4)], () => out.set(20), () => out.set(-20));
        game.unless(a.eq(5), () => out.set(30), () => out.set(-30));
        game.choose([
          { when: a.eq(6), then: () => out.set(40) },
          { when: b.eq(7), then: () => out.set(41) },
        ], () => out.set(42));
        game.match(phase, [
          [1, () => out.set(50)],
          [2, () => out.set(51)],
        ], () => out.set(52));
      });
    });
  `);

  assert.equal(spec.version, baseline.version);
  assert.equal(spec.tick.length, 5);
  assert.ok(spec.tick.every(action => action.op === "if"));

  const all = spec.tick[0];
  assert.equal(all.condition.left.state, "a");
  assert.equal(all.then[0].condition.left.state, "b");
  assert.equal(all.then[0].then[0].value, 10);
  assert.equal(all.else[0].value, -10);
  assert.equal(all.then[0].else[0].value, -10);

  const any = spec.tick[1];
  assert.equal(any.then[0].value, 20);
  assert.equal(any.else[0].condition.left.state, "b");
  assert.equal(any.else[0].then[0].value, 20);
  assert.equal(any.else[0].else[0].value, -20);

  const unless = spec.tick[2];
  assert.equal(unless.then[0].value, -30);
  assert.equal(unless.else[0].value, 30);

  const choose = spec.tick[3];
  assert.equal(choose.condition.left.state, "a");
  assert.equal(choose.then[0].value, 40);
  assert.equal(choose.else[0].condition.left.state, "b");
  assert.equal(choose.else[0].then[0].value, 41);
  assert.equal(choose.else[0].else[0].value, 42);

  const match = spec.tick[4];
  assert.equal(match.condition.left.state, "phase");
  assert.equal(match.condition.right, 1);
  assert.equal(match.then[0].value, 50);
  assert.equal(match.else[0].condition.left.state, "phase");
  assert.equal(match.else[0].condition.right, 2);
  assert.equal(match.else[0].then[0].value, 51);
  assert.equal(match.else[0].else[0].value, 52);

  const parsed = parseProgram(spec);
  assert.equal(parsed.version, baseline.version);
  assert.equal(parsed.tickActions.length, 5);
});

test("choose and match are first-match else-if trees, not independent whens", () => {
  const spec = extractSpec(`
    portableDsl(game => {
      const phase = game.state("phase", 1);
      const out = game.state("out", 0);
      game.tick(() => {
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

  assert.equal(spec.tick[0].then[1].target, "phase");
  assert.equal(spec.tick[0].else[0].condition.right, 2);
  assert.equal(spec.tick[1].then[1].target, "phase");
  assert.equal(spec.tick[1].else[0].condition.right, 3);
  parseProgram(spec);
});

test("condition sugar preserves lexical PlayerContext checks", () => {
  assert.throws(() => extract(`
    portableDsl(game => {
      const players = game.players();
      const out = game.state("out", 0);
      let escaped;
      game.tick(() => {
        game.forSinglePlayer(players, player => { escaped = player.input.left.eq(1); });
        game.whenAll([escaped], () => out.set(1));
      });
    });
  `), /whenAll condition 0 escaped its PlayerContext/);

  assert.throws(() => extract(`
    portableDsl(game => {
      const players = game.players();
      const out = game.state("out", 0);
      let escaped;
      game.tick(() => {
        game.forSinglePlayer(players, player => { escaped = player.input.left; });
        game.match(escaped, [[1, () => out.set(1)]]);
      });
    });
  `), /player input reference escaped its PlayerContext/);
});

test("condition sugar validates bounded case lists and shapes", () => {
  assert.throws(() => extractSpec(`
    portableDsl(game => {
      const out = game.state("out", 0);
      game.tick(() => game.whenAll([], () => out.set(1)));
    });
  `), /whenAll conditions must contain 1\.\.16 entries/);

  assert.throws(() => extractSpec(`
    portableDsl(game => {
      const x = game.state("x", 0);
      game.tick(() => game.choose([{ when: x.eq(1) } as any]));
    });
  `), /choose case 0 then callback is required/);

  assert.throws(() => extractSpec(`
    portableDsl(game => {
      const x = game.state("x", 0);
      game.tick(() => game.match(x, [[1] as any]));
    });
  `), /match case 0 must be \[value, callback\]/);
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
