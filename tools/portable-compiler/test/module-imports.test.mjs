import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { compileDatapack } from "../compiler.mjs";
import { extractPortableSource, PORTABLE_SOURCE_LIMITS } from "../extract.mjs";
import { parseProgram } from "../program.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

function tempTree(files) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "mcgame-modules-"));
  for (const [relative, content] of Object.entries(files)) {
    const filename = path.join(directory, relative);
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    fs.writeFileSync(filename, content);
  }
  return directory;
}

function parseMain(directory) {
  return parseProgram(extractPortableSource(path.join(directory, "main.ts"), root));
}

test("local TypeScript modules compose one portable program", () => {
  const directory = tempTree({
    "config.ts": `export default 4; export const STEP = 2;`,
    "helpers/state.ts": `
      import INITIAL, { STEP } from "../config";
      export function createCounter(game) {
        const counter = game.state("counter", INITIAL);
        return { counter, step: STEP };
      }
    `,
    "game.ts": `
      export { buildGame } from "./helpers/build.ts";
    `,
    "helpers/build.ts": `
      import { createCounter } from "./state";
      export function buildGame(game) {
        const { counter, step } = createCounter(game);
        game.tick(() => counter.add(step));
      }
    `,
    "main.ts": `
      import { buildGame } from "./game";
      portableDsl({ fixedPoint: 1000 }, game => buildGame(game));
    `,
  });
  try {
    const program = parseMain(directory);
    assert.equal(program.version, 9);
    assert.equal(program.initialState.counter, 4000);
    assert.equal(program.tickActions[0].op, "add");
    assert.equal(program.tickActions[0].value.raw, 2000);

    const output = fs.mkdtempSync(path.join(os.tmpdir(), "mcgame-modules-output-"));
    compileDatapack(program, "portable_modules", output);
    const tick = fs.readFileSync(path.join(output, "data/portable_modules/function/portable/tick.mcfunction"), "utf8");
    assert.match(tick, /scoreboard players operation #counter .* \+= #c0 /);
    const load = fs.readFileSync(path.join(output, "data/portable_modules/function/portable/load.mcfunction"), "utf8");
    assert.match(load, /scoreboard players set #c0 .* 2000/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("module loader rejects host, package, and non-TypeScript imports", () => {
  const cases = [
    [`import fs from "node:fs";`, /only relative TypeScript imports.*node:fs/],
    [`import thing from "some-package";`, /only relative TypeScript imports.*some-package/],
    [`import data from "./data.json";`, /must be \.ts files or omit the extension.*data\.json/],
  ];
  for (const [statement, expected] of cases) {
    const directory = tempTree({
      "main.ts": `${statement}\nportableDsl(game => { game.state("x", 0); game.tick(() => {}); });`,
      "data.json": `{}`,
    });
    try {
      assert.throws(() => parseMain(directory), expected);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  }
});

test("module loader rejects dynamic import and authored require", () => {
  for (const [expression, expected] of [
    [`import("./helper")`, /dynamic import\(\) is not supported/],
    [`require("./helper")`, /authored require\(\.\.\.\) is not supported/],
    [`import helper = require("./helper")`, /import = require\(\.\.\.\) is not supported/],
  ]) {
    const directory = tempTree({
      "main.ts": `${expression}; portableDsl(game => { game.state("x", 0); game.tick(() => {}); });`,
      "helper.ts": `export const x = 1;`,
    });
    try {
      assert.throws(() => parseMain(directory), expected);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  }
});

test("module loader rejects source-root and symlink escapes", () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "mcgame-module-escape-"));
  const directory = path.join(parent, "game");
  fs.mkdirSync(directory);
  fs.writeFileSync(path.join(parent, "outside.ts"), `export const outside = 1;`);
  fs.writeFileSync(path.join(directory, "main.ts"), `import { outside } from "../outside"; portableDsl(game => { game.state("x", outside); game.tick(() => {}); });`);
  try {
    assert.throws(() => parseMain(directory), /import escapes the entry source directory/);

    fs.writeFileSync(path.join(directory, "main.ts"), `import { outside } from "./link.ts"; portableDsl(game => { game.state("x", outside); game.tick(() => {}); });`);
    fs.symlinkSync(path.join(parent, "outside.ts"), path.join(directory, "link.ts"));
    assert.throws(() => parseMain(directory), /import escapes the entry source directory/);
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
  }
});

test("module loader rejects circular imports", () => {
  const directory = tempTree({
    "main.ts": `import { build } from "./a"; portableDsl(game => build(game));`,
    "a.ts": `import { value } from "./b"; export function build(game) { game.state("x", value); game.tick(() => {}); }`,
    "b.ts": `import "./a"; export const value = 1;`,
  });
  try {
    assert.throws(() => parseMain(directory), /circular local import is not supported: a\.ts -> b\.ts -> a\.ts/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("module loader enforces graph module and byte limits", () => {
  const countDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "mcgame-module-count-"));
  try {
    const imports = [];
    for (let i = 0; i < PORTABLE_SOURCE_LIMITS.modules; i++) {
      const id = String(i).padStart(2, "0");
      imports.push(`import "./m${id}";`);
      fs.writeFileSync(path.join(countDirectory, `m${id}.ts`), `export const v${id} = ${i};`);
    }
    fs.writeFileSync(path.join(countDirectory, "main.ts"), `${imports.slice(0, PORTABLE_SOURCE_LIMITS.modules - 1).join("\n")}\nportableDsl(game => { game.state("x", 0); game.tick(() => {}); });`);
    assert.equal(parseMain(countDirectory).initialState.x, 0);
    fs.writeFileSync(path.join(countDirectory, "main.ts"), `${imports.join("\n")}\nportableDsl(game => { game.state("x", 0); game.tick(() => {}); });`);
    assert.throws(() => parseMain(countDirectory), new RegExp(`exceeds max module count ${PORTABLE_SOURCE_LIMITS.modules}`));
  } finally {
    fs.rmSync(countDirectory, { recursive: true, force: true });
  }

  const byteDirectory = tempTree({
    "main.ts": `import "./big"; portableDsl(game => { game.state("x", 0); game.tick(() => {}); });`,
    "big.ts": `/*${"x".repeat(PORTABLE_SOURCE_LIMITS.totalBytes)}*/`,
  });
  try {
    assert.throws(() => parseMain(byteDirectory), new RegExp(`exceeds ${PORTABLE_SOURCE_LIMITS.totalBytes} byte limit`));
  } finally {
    fs.rmSync(byteDirectory, { recursive: true, force: true });
  }
});
