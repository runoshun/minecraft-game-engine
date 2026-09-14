import { persistentStorage } from "./compile-context.mjs";

const FULL_SCORE_RANGE = "-2147483648..2147483647";

function declarations(program) {
  const values = [];
  for (const [name, spec] of Object.entries(program.persistentState || {}).sort(([a], [b]) => a.localeCompare(b))) {
    values.push({ session: null, name, ...spec });
  }
  for (const session of [...(program.sessions || [])].sort((a, b) => a.id.localeCompare(b.id))) {
    for (const [name, spec] of Object.entries(session.persistentState || {}).sort(([a], [b]) => a.localeCompare(b))) {
      values.push({ session: session.id, name, ...spec });
    }
  }
  return values;
}

export function compilePersistentLoad(program, lines, ctx) {
  const values = declarations(program);
  if (!values.length) return;
  const storage = persistentStorage(ctx.namespace);
  lines.push(`execute unless data storage ${storage} {objective_ready:1b} run scoreboard objectives add ${ctx.persistentObjective} dummy`);
  lines.push(`execute unless data storage ${storage} {objective_ready:1b} run data modify storage ${storage} objective_ready set value 1b`);
  for (const value of values) {
    const holder = ctx.persistentStateHolder(value.name, value.session);
    const schemaHolder = ctx.persistentSchemaHolder(value.name, value.session);
    lines.push(`execute unless score ${holder} ${ctx.persistentObjective} matches ${FULL_SCORE_RANGE} run scoreboard players set ${holder} ${ctx.persistentObjective} ${value.initialRaw}`);
    if (value.onSchemaMismatch === "reset") {
      lines.push(`execute unless score ${schemaHolder} ${ctx.persistentObjective} matches ${value.schema} run scoreboard players set ${holder} ${ctx.persistentObjective} ${value.initialRaw}`);
    }
    lines.push(`scoreboard players set ${schemaHolder} ${ctx.persistentObjective} ${value.schema}`);
  }
}

export function persistentResetLines(program, ctx) {
  const lines = [];
  for (const value of declarations(program)) {
    lines.push(`scoreboard players set ${ctx.persistentStateHolder(value.name, value.session)} ${ctx.persistentObjective} ${value.initialRaw}`);
    lines.push(`scoreboard players set ${ctx.persistentSchemaHolder(value.name, value.session)} ${ctx.persistentObjective} ${value.schema}`);
  }
  if (!lines.length) lines.push("# no persistent state declarations");
  return lines;
}

export function persistentPurgeLines(program, ctx) {
  if (!declarations(program).length) return ["# no persistent state declarations"];
  return [
    `scoreboard objectives remove ${ctx.persistentObjective}`,
    `data remove storage ${persistentStorage(ctx.namespace)} objective_ready`,
  ];
}
