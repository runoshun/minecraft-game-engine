import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

export const PORTABLE_SOURCE_LIMITS = Object.freeze({
  modules: 64,
  totalBytes: 1_000_000,
});

function unavailable(api) {
  return () => { throw new Error(`${api} is unavailable while extracting portable.define; portable IR must not depend on live Minecraft host state`); };
}

function unavailableMethods(object, names) {
  return Object.freeze(Object.fromEntries(names.map(name => [name, unavailable(`${object}.${name}`)])));
}

function typescript(repoRoot) {
  return require(path.join(repoRoot, "tools/portable-compiler/assets/typescript.cjs"));
}

function transpile(sourceName, source, repoRoot, moduleKind) {
  const ts = typescript(repoRoot);
  const result = ts.transpileModule(source, {
    fileName: sourceName,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: moduleKind,
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

export function transpileTypeScript(sourceName, source, repoRoot) {
  return transpile(sourceName, source, repoRoot, typescript(repoRoot).ModuleKind.None);
}

function createExtractionRuntime(repoRoot) {
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
  return {
    context,
    captured() { return captured; },
  };
}

function requireCaptured(sourceName, runtime) {
  const captured = runtime.captured();
  if (captured === null) throw new Error(`${sourceName} does not call portable.define(...)`);
  return captured;
}

export function extractPortableSpec(sourceName, javascript, repoRoot) {
  const runtime = createExtractionRuntime(repoRoot);
  new vm.Script(javascript, { filename: sourceName }).runInContext(runtime.context, { timeout: 1000 });
  return requireCaptured(sourceName, runtime);
}

function isInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

function moduleId(root, filename) {
  const relative = path.relative(root, filename).split(path.sep).join("/");
  return relative || path.basename(filename);
}

function scanDependencies(filename, source, repoRoot) {
  const ts = typescript(repoRoot);
  const sourceFile = ts.createSourceFile(filename, source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  if (sourceFile.parseDiagnostics?.length) {
    const messages = sourceFile.parseDiagnostics.map(d => ts.flattenDiagnosticMessageText(d.messageText, "\n"));
    throw new Error(`TypeScript diagnostics for ${filename}:\n - ${messages.join("\n - ")}`);
  }

  const dependencies = [];
  function addSpecifier(node) {
    if (!node || !ts.isStringLiteral(node)) throw new Error(`${filename}: module specifier must be a string literal`);
    dependencies.push(node.text);
  }
  function visit(node) {
    if (ts.isImportDeclaration(node)) addSpecifier(node.moduleSpecifier);
    else if (ts.isExportDeclaration(node) && node.moduleSpecifier) addSpecifier(node.moduleSpecifier);
    else if (ts.isImportEqualsDeclaration(node)) throw new Error(`${filename}: import = require(...) is not supported; use static ES import`);
    else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) throw new Error(`${filename}: dynamic import() is not supported`);
    else if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "require") throw new Error(`${filename}: authored require(...) is not supported; use static ES import`);
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return [...new Set(dependencies)];
}

function validateSpecifier(importer, specifier) {
  if (!(specifier.startsWith("./") || specifier.startsWith("../"))) {
    throw new Error(`${importer}: only relative TypeScript imports are supported: ${specifier}`);
  }
  const extension = path.extname(specifier);
  if (extension && extension !== ".ts") {
    throw new Error(`${importer}: imported modules must be .ts files or omit the extension: ${specifier}`);
  }
}

function resolveModule(sourceRoot, importer, specifier) {
  validateSpecifier(importer, specifier);
  const unresolved = path.resolve(path.dirname(importer), specifier.endsWith(".ts") ? specifier : `${specifier}.ts`);
  if (!fs.existsSync(unresolved) || !fs.statSync(unresolved).isFile()) {
    throw new Error(`${importer}: imported TypeScript module not found: ${specifier}`);
  }
  const resolved = fs.realpathSync(unresolved);
  if (!isInside(sourceRoot, resolved)) {
    throw new Error(`${importer}: import escapes the entry source directory: ${specifier}`);
  }
  if (path.extname(resolved) !== ".ts") {
    throw new Error(`${importer}: imported module is not a .ts file: ${specifier}`);
  }
  return resolved;
}

function readModuleGraph(sourcePath, repoRoot) {
  const entry = fs.realpathSync(sourcePath);
  if (path.extname(entry) !== ".ts") throw new Error("portable source must be a .ts file");
  const sourceRoot = fs.realpathSync(path.dirname(entry));
  const modules = new Map();
  const visiting = [];
  let totalBytes = 0;

  function load(filename) {
    if (modules.has(filename)) return;
    const cycleIndex = visiting.indexOf(filename);
    if (cycleIndex !== -1) {
      const cycle = [...visiting.slice(cycleIndex), filename].map(file => moduleId(sourceRoot, file)).join(" -> ");
      throw new Error(`circular local import is not supported: ${cycle}`);
    }
    if (modules.size + visiting.length >= PORTABLE_SOURCE_LIMITS.modules) {
      throw new Error(`portable source exceeds max module count ${PORTABLE_SOURCE_LIMITS.modules}`);
    }

    visiting.push(filename);
    const bytes = fs.readFileSync(filename);
    totalBytes += bytes.length;
    if (totalBytes > PORTABLE_SOURCE_LIMITS.totalBytes) {
      throw new Error(`portable source graph exceeds ${PORTABLE_SOURCE_LIMITS.totalBytes} byte limit`);
    }
    const source = bytes.toString("utf8");
    const specifiers = scanDependencies(filename, source, repoRoot);
    const dependencies = Object.create(null);
    for (const specifier of specifiers) {
      const dependency = resolveModule(sourceRoot, filename, specifier);
      dependencies[specifier] = moduleId(sourceRoot, dependency);
      load(dependency);
    }
    visiting.pop();

    const ts = typescript(repoRoot);
    const javascript = transpile(filename, source, repoRoot, ts.ModuleKind.CommonJS);
    modules.set(filename, {
      id: moduleId(sourceRoot, filename),
      filename,
      dependencies,
      javascript,
    });
  }

  load(entry);
  return { entry, sourceRoot, modules: [...modules.values()], totalBytes };
}

function moduleBundle(graph) {
  const declarations = graph.modules.map(module => {
    const id = JSON.stringify(module.id);
    const dependencies = JSON.stringify(module.dependencies);
    return `modules[${id}]={deps:${dependencies},factory:function(exports,module,require){\n${module.javascript}\n}};`;
  }).join("\n");
  const entryId = JSON.stringify(moduleId(graph.sourceRoot, graph.entry));
  return `(() => {\n` +
    `const modules=Object.create(null),cache=Object.create(null);\n` +
    `${declarations}\n` +
    `function load(id){\n` +
    `  if(cache[id]) return cache[id].exports;\n` +
    `  const record=modules[id]; if(!record) throw new Error(\"portable module not registered: \"+id);\n` +
    `  const module={exports:{}}; cache[id]=module;\n` +
    `  const localRequire=specifier=>{ const target=record.deps[specifier]; if(!target) throw new Error(id+\": undeclared module request: \"+specifier); return load(target); };\n` +
    `  record.factory(module.exports,module,localRequire);\n` +
    `  return module.exports;\n` +
    `}\n` +
    `load(${entryId});\n` +
    `})();`;
}

export function extractPortableSource(sourcePath, repoRoot) {
  const absolute = path.resolve(sourcePath);
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) throw new Error(`portable source not found: ${sourcePath}`);
  const graph = readModuleGraph(absolute, repoRoot);
  const runtime = createExtractionRuntime(repoRoot);
  const sourceName = graph.entry;
  new vm.Script(moduleBundle(graph), { filename: `${sourceName} (portable module bundle)` }).runInContext(runtime.context, { timeout: 1000 });
  return requireCaptured(sourceName, runtime);
}
