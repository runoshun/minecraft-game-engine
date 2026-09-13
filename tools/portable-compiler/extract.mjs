import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

function unavailable(api) {
  return () => { throw new Error(`${api} is unavailable while extracting portable.define; portable IR must not depend on live host state`); };
}

function unavailableMethods(object, names) {
  return Object.freeze(Object.fromEntries(names.map(name => [name, unavailable(`${object}.${name}`)])));
}

export function transpileTypeScript(sourceName, source, repoRoot) {
  const ts = require(path.join(repoRoot, "src/main/resources/mcgame/typescript.js"));
  const result = ts.transpileModule(source, {
    fileName: sourceName,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.None,
      strict: true,
      removeComments: false,
    },
    reportDiagnostics: true,
  });
  const diagnostics = result.diagnostics || [];
  if (diagnostics.length) {
    const messages = diagnostics.map(d => ts.flattenDiagnosticMessageText(d.messageText, "\n"));
    throw new Error(`TypeScript diagnostics for ${sourceName}:\n - ${messages.join("\n - ")}`);
  }
  return result.outputText;
}

export function extractPortableSpec(sourceName, javascript, repoRoot) {
  let captured = null;
  const noops = Object.freeze({ onStart() {}, onBeforeTick() {}, onTick() {}, log() {} });
  const portable = Object.freeze({
    define(spec) {
      if (captured !== null) throw new Error("portable.define may only be called once");
      captured = JSON.parse(JSON.stringify(spec));
    },
    get: unavailable("portable.get"),
    raw: unavailable("portable.raw"),
    setInput: unavailable("portable.setInput"),
    input: unavailable("portable.input"),
  });
  const sandbox = {
    portable,
    game: noops,
    menu: Object.freeze({ onAction() {}, open: unavailable("menu.open"), update: unavailable("menu.update"), close: unavailable("menu.close") }),
    input: Object.freeze({ players: unavailable("input.players"), get: unavailable("input.get"), pressed: unavailable("input.pressed") }),
    actors: unavailableMethods("actors", ["spawn", "move", "remove"]),
    camera: unavailableMethods("camera", ["attach", "move", "detach"]),
    world: unavailableMethods("world", ["setBlock", "setBlocks", "fill"]),
    effects: unavailableMethods("effects", ["particle", "sound"]),
    render: unavailableMethods("render", ["spawn", "update", "remove", "attach", "detach"]),
    ui: unavailableMethods("ui", ["panel", "hud"]),
  };
  const context = vm.createContext(sandbox, { codeGeneration: { strings: false, wasm: false } });
  const dsl = fs.readFileSync(path.join(repoRoot, "src/main/resources/mcgame/portable-dsl.js"), "utf8");
  new vm.Script(dsl, { filename: "portable-dsl.js" }).runInContext(context, { timeout: 1000 });
  new vm.Script(javascript, { filename: sourceName }).runInContext(context, { timeout: 1000 });
  if (captured === null) throw new Error(`${sourceName} does not call portable.define(...)`);
  return captured;
}
