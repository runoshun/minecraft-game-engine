export function aabbEdge(center, offset, lines, ctx) {
  const temp = ctx.nextCollisionTemp(), source = ctx.score(center);
  lines.push(`scoreboard players operation ${temp} ${ctx.objective} = ${source.holder} ${source.objective}`);
  if (offset !== 0) lines.push(`scoreboard players operation ${temp} ${ctx.objective} ${offset > 0 ? "+=" : "-="} ${ctx.constantHolder(Math.abs(offset))} ${ctx.objective}`);
  return temp;
}

export function squaredDistance(dx, dy, lines, ctx) {
  const a = ctx.nextCollisionTemp(), b = ctx.nextCollisionTemp();
  lines.push(`scoreboard players operation ${a} ${ctx.objective} = ${dx} ${ctx.objective}`);
  lines.push(`scoreboard players operation ${a} ${ctx.objective} *= ${a} ${ctx.objective}`);
  lines.push(`scoreboard players operation ${b} ${ctx.objective} = ${dy} ${ctx.objective}`);
  lines.push(`scoreboard players operation ${b} ${ctx.objective} *= ${b} ${ctx.objective}`);
  lines.push(`scoreboard players operation ${a} ${ctx.objective} += ${b} ${ctx.objective}`);
  return a;
}

function nested(actions, ctx, compileActions) {
  const name = ctx.nextBranchFunctionName(), body = [];
  compileActions(actions, body, ctx);
  ctx.functions.set(name, body);
  return name;
}

export function booleanBranches(flag, thenActions, elseActions, lines, ctx, compileActions) {
  if (thenActions.length) {
    const fn = nested(thenActions, ctx, compileActions);
    lines.push(`execute if score ${flag} ${ctx.objective} matches 1 run function ${ctx.namespace}:portable/${fn}`);
  }
  if (elseActions.length) {
    const fn = nested(elseActions, ctx, compileActions);
    lines.push(`execute unless score ${flag} ${ctx.objective} matches 1 run function ${ctx.namespace}:portable/${fn}`);
  }
}

export function comparisonBranches(left, comparator, right, thenActions, elseActions, lines, ctx, compileActions) {
  if (thenActions.length) {
    const fn = nested(thenActions, ctx, compileActions);
    lines.push(`execute if score ${left} ${ctx.objective} ${comparator} ${right} ${ctx.objective} run function ${ctx.namespace}:portable/${fn}`);
  }
  if (elseActions.length) {
    const fn = nested(elseActions, ctx, compileActions);
    lines.push(`execute unless score ${left} ${ctx.objective} ${comparator} ${right} ${ctx.objective} run function ${ctx.namespace}:portable/${fn}`);
  }
}

export function scoreToTemp(value, lines, ctx) {
  const temp = ctx.nextCollisionTemp(), source = ctx.score(value);
  lines.push(`scoreboard players operation ${temp} ${ctx.objective} = ${source.holder} ${source.objective}`);
  return temp;
}
