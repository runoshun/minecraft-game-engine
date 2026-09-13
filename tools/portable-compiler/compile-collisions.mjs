import { fail } from "./utils.mjs";
import { aabbEdge, booleanBranches, comparisonBranches, scoreToTemp, squaredDistance } from "./compile-collision-common.mjs";

function subtractValue(temp, value, lines, ctx) {
  const source = ctx.score(value);
  lines.push(`scoreboard players operation ${temp} ${ctx.objective} -= ${source.holder} ${source.objective}`);
}

export function compileAabbIf(a, lines, ctx, compileActions) {
  const al = aabbEdge(a.a.x, -a.a.halfWidthRaw, lines, ctx), ar = aabbEdge(a.a.x, a.a.halfWidthRaw, lines, ctx);
  const ab = aabbEdge(a.a.y, -a.a.halfHeightRaw, lines, ctx), at = aabbEdge(a.a.y, a.a.halfHeightRaw, lines, ctx);
  const bl = aabbEdge(a.b.x, -a.b.halfWidthRaw, lines, ctx), br = aabbEdge(a.b.x, a.b.halfWidthRaw, lines, ctx);
  const bb = aabbEdge(a.b.y, -a.b.halfHeightRaw, lines, ctx), bt = aabbEdge(a.b.y, a.b.halfHeightRaw, lines, ctx);
  const flag = ctx.nextCollisionTemp();
  lines.push(`scoreboard players set ${flag} ${ctx.objective} 0`);
  lines.push(`execute if score ${al} ${ctx.objective} <= ${br} ${ctx.objective} if score ${ar} ${ctx.objective} >= ${bl} ${ctx.objective} if score ${ab} ${ctx.objective} <= ${bt} ${ctx.objective} if score ${at} ${ctx.objective} >= ${bb} ${ctx.objective} run scoreboard players set ${flag} ${ctx.objective} 1`);
  booleanBranches(flag, a.then, a.else, lines, ctx, compileActions);
}

export function compileCircleIf(a, lines, ctx, compileActions) {
  const divisor = ctx.program.collisionDivisor;
  const dx = scoreToTemp(a.a.x, lines, ctx); subtractValue(dx, a.b.x, lines, ctx);
  if (divisor > 1) lines.push(`scoreboard players operation ${dx} ${ctx.objective} /= ${ctx.constantHolder(divisor)} ${ctx.objective}`);
  lines.push(`scoreboard players operation ${dx} ${ctx.objective} *= ${dx} ${ctx.objective}`);
  const dy = scoreToTemp(a.a.y, lines, ctx); subtractValue(dy, a.b.y, lines, ctx);
  if (divisor > 1) lines.push(`scoreboard players operation ${dy} ${ctx.objective} /= ${ctx.constantHolder(divisor)} ${ctx.objective}`);
  lines.push(`scoreboard players operation ${dy} ${ctx.objective} *= ${dy} ${ctx.objective}`);
  lines.push(`scoreboard players operation ${dx} ${ctx.objective} += ${dy} ${ctx.objective}`);
  const radius = Math.trunc((a.a.radiusRaw + a.b.radiusRaw) / divisor), squared = radius * radius;
  if (squared > 2147483647) fail("portable circle collision radius exceeds scoreboard squared range");
  comparisonBranches(dx, "<=", ctx.constantHolder(squared), a.then, a.else, lines, ctx, compileActions);
}

export function compileCircleCapsuleIf(a, lines, ctx, compileActions) {
  const d = ctx.program.collisionDivisor, c = a.capsule;
  const ax = Math.trunc(c.axRaw / d), ay = Math.trunc(c.ayRaw / d), bx = Math.trunc(c.bxRaw / d), by = Math.trunc(c.byRaw / d);
  const vx = bx - ax, vy = by - ay, len2 = vx * vx + vy * vy;
  if (len2 <= 0 || len2 > 2147483647) fail("portable capsule length is outside scoreboard collision range");
  const radius = Math.trunc((a.circle.radiusRaw + c.radiusRaw) / d), radius2 = radius * radius;
  if (radius < 0 || radius > 2147483647 || radius2 > 2147483647) fail("portable circle/capsule radius exceeds scoreboard collision range");
  const px = scoreToTemp(a.circle.x, lines, ctx);
  if (d > 1) lines.push(`scoreboard players operation ${px} ${ctx.objective} /= ${ctx.constantHolder(d)} ${ctx.objective}`);
  const py = scoreToTemp(a.circle.y, lines, ctx);
  if (d > 1) lines.push(`scoreboard players operation ${py} ${ctx.objective} /= ${ctx.constantHolder(d)} ${ctx.objective}`);
  const flag = ctx.nextCollisionTemp(); lines.push(`scoreboard players set ${flag} ${ctx.objective} 0`);
  const detail = [];
  const wx = ctx.nextCollisionTemp(); detail.push(`scoreboard players operation ${wx} ${ctx.objective} = ${px} ${ctx.objective}`); detail.push(`scoreboard players operation ${wx} ${ctx.objective} -= ${ctx.constantHolder(ax)} ${ctx.objective}`);
  const wy = ctx.nextCollisionTemp(); detail.push(`scoreboard players operation ${wy} ${ctx.objective} = ${py} ${ctx.objective}`); detail.push(`scoreboard players operation ${wy} ${ctx.objective} -= ${ctx.constantHolder(ay)} ${ctx.objective}`);
  const dot = ctx.nextCollisionTemp(); detail.push(`scoreboard players operation ${dot} ${ctx.objective} = ${wx} ${ctx.objective}`); detail.push(`scoreboard players operation ${dot} ${ctx.objective} *= ${ctx.constantHolder(vx)} ${ctx.objective}`);
  const dotY = ctx.nextCollisionTemp(); detail.push(`scoreboard players operation ${dotY} ${ctx.objective} = ${wy} ${ctx.objective}`); detail.push(`scoreboard players operation ${dotY} ${ctx.objective} *= ${ctx.constantHolder(vy)} ${ctx.objective}`); detail.push(`scoreboard players operation ${dot} ${ctx.objective} += ${dotY} ${ctx.objective}`);
  const distA = squaredDistance(wx, wy, detail, ctx);
  const dxB = ctx.nextCollisionTemp(); detail.push(`scoreboard players operation ${dxB} ${ctx.objective} = ${px} ${ctx.objective}`); detail.push(`scoreboard players operation ${dxB} ${ctx.objective} -= ${ctx.constantHolder(bx)} ${ctx.objective}`);
  const dyB = ctx.nextCollisionTemp(); detail.push(`scoreboard players operation ${dyB} ${ctx.objective} = ${py} ${ctx.objective}`); detail.push(`scoreboard players operation ${dyB} ${ctx.objective} -= ${ctx.constantHolder(by)} ${ctx.objective}`);
  const distB = squaredDistance(dxB, dyB, detail, ctx);
  const cross = ctx.nextCollisionTemp(); detail.push(`scoreboard players operation ${cross} ${ctx.objective} = ${wx} ${ctx.objective}`); detail.push(`scoreboard players operation ${cross} ${ctx.objective} *= ${ctx.constantHolder(vy)} ${ctx.objective}`);
  const other = ctx.nextCollisionTemp(); detail.push(`scoreboard players operation ${other} ${ctx.objective} = ${wy} ${ctx.objective}`); detail.push(`scoreboard players operation ${other} ${ctx.objective} *= ${ctx.constantHolder(vx)} ${ctx.objective}`); detail.push(`scoreboard players operation ${cross} ${ctx.objective} -= ${other} ${ctx.objective}`);
  const r2 = ctx.constantHolder(radius2), l2 = ctx.constantHolder(len2), crossLimit = Math.floor(Math.sqrt(radius2 * len2));
  detail.push(`execute if score ${dot} ${ctx.objective} matches ..0 if score ${distA} ${ctx.objective} <= ${r2} ${ctx.objective} run scoreboard players set ${flag} ${ctx.objective} 1`);
  detail.push(`execute if score ${dot} ${ctx.objective} matches 1.. if score ${dot} ${ctx.objective} < ${l2} ${ctx.objective} if score ${cross} ${ctx.objective} matches ${-crossLimit}..${crossLimit} run scoreboard players set ${flag} ${ctx.objective} 1`);
  detail.push(`execute if score ${dot} ${ctx.objective} >= ${l2} ${ctx.objective} if score ${distB} ${ctx.objective} <= ${r2} ${ctx.objective} run scoreboard players set ${flag} ${ctx.objective} 1`);
  const fn = ctx.nextBranchFunctionName(); ctx.functions.set(fn, detail);
  lines.push(`execute if score ${px} ${ctx.objective} matches ${Math.min(ax, bx) - radius}..${Math.max(ax, bx) + radius} if score ${py} ${ctx.objective} matches ${Math.min(ay, by) - radius}..${Math.max(ay, by) + radius} run function ${ctx.namespace}:portable/${fn}`);
  booleanBranches(flag, a.then, a.else, lines, ctx, compileActions);
}

export function compileTriggerIf(a, lines, ctx, compileActions) {
  const left = aabbEdge(a.trigger.x, -a.trigger.halfWidthRaw, lines, ctx), right = aabbEdge(a.trigger.x, a.trigger.halfWidthRaw, lines, ctx);
  const bottom = aabbEdge(a.trigger.y, -a.trigger.halfHeightRaw, lines, ctx), top = aabbEdge(a.trigger.y, a.trigger.halfHeightRaw, lines, ctx);
  const x = ctx.score(a.point.x), y = ctx.score(a.point.y), flag = ctx.nextCollisionTemp();
  lines.push(`scoreboard players set ${flag} ${ctx.objective} 0`);
  lines.push(`execute if score ${x.holder} ${x.objective} >= ${left} ${ctx.objective} if score ${x.holder} ${x.objective} <= ${right} ${ctx.objective} if score ${y.holder} ${y.objective} >= ${bottom} ${ctx.objective} if score ${y.holder} ${y.objective} <= ${top} ${ctx.objective} run scoreboard players set ${flag} ${ctx.objective} 1`);
  booleanBranches(flag, a.then, a.else, lines, ctx, compileActions);
}
