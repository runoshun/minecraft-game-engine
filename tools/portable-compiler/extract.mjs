import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

function unavailable(api) {
  return () => { throw new Error(`${api} is unavailable while extracting portable.define; portable IR must not depend on live Minecraft host state`); };
}

function unavailableMethods(object, names) {
  return Object.freeze(Object.fromEntries(names.map(name => [name, unavailable(`${object}.${name}`)])));
}

export function transpileTypeScript(sourceName, source, repoRoot) {
  const ts = require(path.join(repoRoot, "tools/portable-compiler/assets/typescript.cjs"));
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
  const portable = Object.freeze({
    define(spec) {
      if (captured !== null) throw new Error("portable.define may only be called once");
      captured = JSON.parse(JSON.stringify(spec));
    },
  });

  // These names intentionally exist only to produce explicit errors for retired
  // runtime-host APIs instead of an ambiguous ReferenceError during extraction.
  const sandbox = {
    portable,
    game: unavailableMethods("game", ["onStart", "onBeforeTick", "onTick", "log"]),
    input: unavailableMethods("input", ["players", "get", "pressed"]),
    actors: unavailableMethods("actors", ["spawn", "move", "remove"]),
    render: unavailableMethods("render", ["spawn", "update", "remove", "attach", "detach"]),
    ui: unavailableMethods("ui", ["panel", "hud"]),
    menu: unavailableMethods("menu", ["onAction", "open", "update", "close"]),
    camera: unavailableMethods("camera", ["attach", "move", "detach"]),
    world: unavailableMethods("world", ["setBlock", "setBlocks", "fill"]),
    effects: unavailableMethods("effects", ["particle", "sound"]),
  };

  const context = vm.createContext(sandbox, { codeGeneration: { strings: false, wasm: false } });
  const dsl = fs.readFileSync(path.join(repoRoot, "tools/portable-compiler/assets/portable-dsl.js"), "utf8");
  new vm.Script(dsl, { filename: "portable-dsl.js" }).runInContext(context, { timeout: 1000 });
  new vm.Script(javascript, { filename: sourceName }).runInContext(context, { timeout: 1000 });
  if (captured === null) throw new Error(`${sourceName} does not call portable.define(...)`);
  return captured;
}
