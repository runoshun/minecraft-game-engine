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
  const js = transpileTypeScript("arithmetic-v28.ts", source, root);
  return parseProgram(extractPortableSpec("arithmetic-v28.ts", js, root));
}

function compileSource(source, namespace = "portable_arithmetic_v28") {
  const program = extract(source);
  const output = fs.mkdtempSync(path.join(os.tmpdir(), "mcgame-v28-arithmetic-"));
  compileDatapack(program, namespace, output);
  return { program, output };
}

function read(output, relative) {
  return fs.readFileSync(path.join(output, relative), "utf8");
}

test("v28 constant scalar mul/div lower through reduced fixed-point ratios", () => {
  const { program, output } = compileSource(`
    portableDsl({ fixedPoint: 1000 }, game => {
      const x = game.state("x", 2);
      const saved = game.persistentState("saved", -2);
      const players = game.players();

      game.tick(() => {
        x.mul(0.98);
        x.div(2);
        x.mul(-1);
        saved.div(-0.5);

        game.forEachPlayer(players, player => {
          const velocity = player.state("velocity", 1);
          velocity.mul(1.5);
          velocity.div(4);
        });
      });
    });
  `);

  assert.equal(program.version, 28);
  assert.deepEqual(program.tickActions.slice(0, 4).map(action => [action.op, action.factorRaw]), [
    ["mul", 980],
    ["div", 2000],
    ["mul", -1000],
    ["persistent_div", -500],
  ]);

  const load = read(output, "data/portable_arithmetic_v28/function/portable/load.mcfunction");
  const tick = read(output, "data/portable_arithmetic_v28/function/portable/tick.mcfunction");
  const player = read(output, "data/portable_arithmetic_v28/function/portable/player_000.mcfunction");
  const marker = read(output, ".mcgame-portable-generated");

  assert.match(load, /scoreboard players set #neg1 .* -1/);
  assert.match(load, /scoreboard players set #c\d+ .* 49/);
  assert.match(load, /scoreboard players set #c\d+ .* 50/);
  assert.match(load, /scoreboard players set #c\d+ .* 2/);
  assert.match(load, /scoreboard players set #c\d+ .* 3/);
  assert.match(load, /scoreboard players set #c\d+ .* 4/);

  assert.match(tick, /scoreboard players operation #x .* \*= #c\d+ .*/);
  assert.match(tick, /scoreboard players operation #x .* \/= #c\d+ .*/);
  assert.match(tick, /scoreboard players operation #x .* \*= #neg1 .*/);
  assert.match(player, /scoreboard players operation @s .* \*= #c\d+ .*/);
  assert.match(player, /scoreboard players operation @s .* \/= #c\d+ .*/);
  assert.match(marker, /portable_version=28/);
});

test("v28 mul by zero is exact and div rejects a divisor quantized to zero", () => {
  const { output } = compileSource(`
    portableDsl({ fixedPoint: 1000 }, game => {
      const x = game.state("x", 2);
      game.tick(() => x.mul(0));
    });
  `, "portable_arithmetic_zero");

  const tick = read(output, "data/portable_arithmetic_zero/function/portable/tick.mcfunction");
  assert.match(tick, /scoreboard players set #x .* 0/);

  assert.throws(() => extract(`
    portableDsl({ fixedPoint: 1000 }, game => {
      const x = game.state("x", 2);
      game.tick(() => x.div(0.0004));
    });
  `), /factor resolves to zero at fixedPoint 1000/);
});

test("raw mul/div IR is v28-only and factor is a compile-time number", () => {
  assert.throws(() => parseProgram({
    version: 27,
    fixedPoint: 1000,
    state: { x: 1000 },
    tick: [{ op: "mul", target: "x", factor: 0.98 }],
  }), /requires portable version 28/);

  assert.throws(() => parseProgram({
    version: 28,
    fixedPoint: 1000,
    state: { x: 1000 },
    tick: [{ op: "mul", target: "x", factor: { state: "x" } }],
  }), /must be finite/);
});

test("v28 constant arithmetic is available in session and placeable scalar scopes", () => {
  const { program, output } = compileSource(`
    portableDsl({
      fixedPoint: 1000,
      ownership: { minX: 0, minZ: 0, maxX: 16, maxZ: 16 },
    }, game => {
      const team = game.teamPlayers("arith");
      const item = game.item("token", {
        name: "Arithmetic Token",
        appearance: { kind: "model", model: "minecraft:armor_stand" },
      });

      game.placeable("machine", { item, maxInstances: 1 }, machine => {
        const gain = machine.state("gain", 1);
        machine.tick(() => {
          gain.mul(1.25);
          gain.div(5);
        });
      });

      game.tick(() => {
        game.session("arith", team, session => {
          const velocity = session.state("velocity", 1);
          const memory = session.persistentState("memory", 1);
          velocity.mul(0.75);
          memory.div(2);
        });
      });
    });
  `, "portable_arithmetic_scopes");

  assert.equal(program.version, 28);
  const serialized = JSON.stringify(program.tickActions);
  assert.match(serialized, /"op":"mul","session":"arith","target":"velocity","factorRaw":750/);
  assert.match(serialized, /"op":"persistent_div","session":"arith","target":"memory","factorRaw":2000/);
  assert.match(serialized, /"op":"placeable_mul"/);
  assert.match(serialized, /"op":"placeable_div"/);

  const marker = read(output, ".mcgame-portable-generated");
  assert.match(marker, /portable_version=28/);
});
