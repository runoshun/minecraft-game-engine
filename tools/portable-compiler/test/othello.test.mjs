import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { compileDatapack } from "../compiler.mjs";
import { extractPortableSource } from "../extract.mjs";
import { parseProgram } from "../program.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const source = path.join(root, "examples/portable-othello/datapack/data/portable_othello/mcgame/main.ts");

test("portable Othello stays on v23 and fits bounded board/interaction/action budgets", () => {
  const spec = extractPortableSource(source, root);
  const program = parseProgram(spec);

  assert.equal(program.version, 23);
  assert.equal(program.grids.length, 1);
  assert.equal(program.grids[0].id, "board");
  assert.equal(program.grids[0].width, 8);
  assert.equal(program.grids[0].height, 8);
  assert.equal(program.gridWorlds.length, 1);
  assert.equal(program.interactions.length, 63);
  assert.ok(program.interactions.some(value => value.id === "seat_black"));
  assert.ok(program.interactions.some(value => value.id === "seat_white"));
  assert.ok(program.interactions.some(value => value.id === "reset"));
  assert.ok(!program.interactions.some(value => value.id === "cell_3_3"));
  assert.ok(!program.interactions.some(value => value.id === "cell_4_4"));
  assert.ok(!program.interactions.some(value => value.id === "cell_3_4"));
  assert.ok(!program.interactions.some(value => value.id === "cell_4_3"));

  const output = fs.mkdtempSync(path.join(os.tmpdir(), "mcgame-othello-"));
  const result = compileDatapack(program, "portable_othello", output);
  assert.equal(result.interactionCount, 63);
  assert.equal(result.gridCount, 1);
  assert.equal(result.gridWorldCount, 1);
  assert.equal(result.playerStateCount, 1);
  assert.ok(result.branchFunctionCount < 800);

  const marker = fs.readFileSync(path.join(output, ".mcgame-portable-generated"), "utf8");
  assert.match(marker, /portable_version=23/);
  assert.match(marker, /player\.state\.othelloColor=/);
  assert.match(marker, /grid\.board=/);
});
