#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compileDatapack } from "./compiler.mjs";
import { extractPortableSpec, transpileTypeScript } from "./extract.mjs";
import { parseProgram } from "./program.mjs";

function parseArgs(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!["--source", "--namespace", "--output"].includes(arg)) throw new Error(`unknown argument: ${arg}`);
    if (++i >= argv.length) throw new Error(`${arg} requires a value`);
    result[arg.slice(2)] = argv[i];
  }
  if (!result.source || !result.namespace || !result.output) throw new Error("usage: --source <main.ts> --namespace <namespace> --output <directory>");
  return result;
}

function cleanGeneratedOutput(output) {
  if (!fs.existsSync(output)) return;
  if (fs.readdirSync(output).length === 0) return;
  if (!fs.existsSync(path.join(output, ".mcgame-portable-generated"))) throw new Error(`refusing to overwrite non-generated directory: ${output}`);
  fs.rmSync(output, { recursive: true, force: true });
}

function findRepoRoot() {
  let current = path.dirname(fileURLToPath(import.meta.url));
  while (current !== path.dirname(current)) {
    if (fs.existsSync(path.join(current, "PROJECT_RULES.md"))) return current;
    current = path.dirname(current);
  }
  throw new Error("could not locate repository root");
}

export function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv), root = findRepoRoot();
  const source = path.resolve(args.source), output = path.resolve(args.output);
  const bytes = fs.readFileSync(source);
  if (bytes.length > 1_000_000) throw new Error("portable source exceeds 1 MB PoC limit");
  cleanGeneratedOutput(output);
  const js = transpileTypeScript(source, bytes.toString("utf8"), root);
  const spec = extractPortableSpec(source, js, root);
  const program = parseProgram(spec);
  const result = compileDatapack(program, args.namespace, output);
  console.log("Compiled portable program");
  console.log(`  namespace: ${result.namespace}`);
  console.log(`  objective: ${result.objective}`);
  console.log(`  states: ${result.stateCount}`);
  if (result.persistentStateCount) console.log(`  persistent states: ${result.persistentStateCount}`);
  if (result.persistentGridCount) console.log(`  persistent grids: ${result.persistentGridCount}`);
  if (result.persistentGridCellCount) console.log(`  persistent grid cells: ${result.persistentGridCellCount}`);
  if (result.selectionCount) console.log(`  selections: ${result.selectionCount}`);
  if (result.formCount) console.log(`  forms: ${result.formCount}`);
  console.log(`  inputs: ${result.inputCount}`);
  if (result.playerStateCount) console.log(`  player states: ${result.playerStateCount}`);
  if (result.playerInputCount) console.log(`  player inputs: ${result.playerInputCount}`);
  if (result.playerSetCount) console.log(`  team player sets: ${result.playerSetCount}`);
  if (result.sessionCount) console.log(`  sessions: ${result.sessionCount}`);
  if (result.sessionStateCount) console.log(`  session states: ${result.sessionStateCount}`);
  if (result.sessionGridCount) console.log(`  session grids: ${result.sessionGridCount}`);
  if (result.sessionRngCount) console.log(`  session rngs: ${result.sessionRngCount}`);
  if (result.sessionGridWorldCount) console.log(`  session grid worlds: ${result.sessionGridWorldCount}`);
  if (result.gridCount) console.log(`  grids: ${result.gridCount}`);
  if (result.rngCount) console.log(`  rngs: ${result.rngCount}`);
  if (result.gridWorldCount) console.log(`  grid worlds: ${result.gridWorldCount}`);
  console.log(`  projections: ${result.projectionCount}`);
  console.log(`  texts: ${result.textCount}`);
  console.log(`  actors: ${result.actorCount}`);
  console.log(`  world batches: ${result.worldBatchCount}`);
  console.log(`  cameras: ${result.cameraCount}`);
  console.log(`  particles: ${result.particleCount}`);
  console.log(`  sounds: ${result.soundCount}`);
  console.log(`  huds: ${result.hudCount}`);
  if (result.playerHudCount) console.log(`  player huds: ${result.playerHudCount}`);
  console.log(`  sidebars: ${result.sidebarCount}`);
  console.log(`  branch functions: ${result.branchFunctionCount}`);
  console.log(`  output: ${output}`);
}

try { main(); } catch (error) { console.error(error?.stack || String(error)); process.exitCode = 1; }
