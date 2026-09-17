import { LIMITS, PORTABLE_ID, fail, has, isObject, requiredArray, requiredMember, requiredObject, requiredString, memberString, memberNumber, memberBoolean, memberBoundedInt, boundedInteger, memberResource, portableId, floorDiv } from "./utils.mjs";
import { parseCondition, parseCoordinate, parseTokens } from "./parse-value.mjs";
import { parseVec3 } from "./parse-shapes.mjs";
import { parsePlayerSetRef, playerSetKey, validateDisjointAudiences } from "./player-set.mjs";

function uniqueIds(values, path) {
  const seen = new Set();
  for (let i = 0; i < values.length; i++) {
    const id = portableId(values[i], `${path}[${i}]`);
    if (seen.has(id)) fail(`${path}[${i}].id is duplicated: ${id}`);
    seen.add(id);
  }
}

export function parseVanillaUi(vanilla, ctx, api) {
  const out = { cameras: [], particles: [], sounds: [], huds: [], playerHuds: [], sidebars: [], ownership: null };
  if (has(vanilla, "cameras")) {
    if (ctx.version < 3) fail(`${api}.vanilla.cameras requires portable version 3`);
    const values = requiredArray(vanilla, "cameras", `${api}.vanilla`);
    const cameraLimit = ctx.version >= 14 ? LIMITS.cameras : 1;
    if (values.length > cameraLimit) fail(`${api}.vanilla.cameras exceeds max camera count ${cameraLimit}`);
    uniqueIds(values, `${api}.vanilla.cameras`);
    out.cameras = values.map((v, i) => {
      const p = `${api}.vanilla.cameras[${i}]`, pitch = memberNumber(v, "pitch", 0, p), mode = memberString(v, "mode", "position_lock", p);
      if (pitch < -90 || pitch > 90) fail(`${p}.pitch must be between -90 and 90`);
      if (has(v, "mode") && ctx.version < 11) fail(`${p}.mode requires portable version 11`);
      if (!["position_lock", "spectate"].includes(mode)) fail(`${p}.mode must be position_lock or spectate`);
      let audience = null;
      if (has(v, "audience")) {
        if (ctx.version < 12) fail(`${p}.audience requires portable version 12`);
        const rawAudience = requiredMember(v, "audience", p);
        if (isObject(rawAudience) && has(rawAudience, "interactionController")) {
          if (ctx.version < 26) fail(`${p}.audience interactionController requires portable version 26`);
          for (const key of Object.keys(rawAudience)) if (key !== "interactionController") fail(`${p}.audience.${key} is not supported`);
          const interactionController = requiredString(rawAudience, "interactionController", `${p}.audience`);
          if (!PORTABLE_ID.test(interactionController)) fail(`${p}.audience.interactionController must match ${PORTABLE_ID.source}`);
          if (!ctx.interactions?.has(interactionController)) fail(`${p}.audience references unknown interaction controller ${interactionController}`);
          audience = { interactionController };
        } else audience = parsePlayerSetRef(rawAudience, ctx, `${p}.audience`);
      } else if (ctx.version >= 12) audience = "all_online";
      return { id: v.id, dimension: memberResource(v, "dimension", "minecraft:overworld", p), x: parseCoordinate(requiredMember(v, "x", p), ctx, `${p}.x`), y: parseCoordinate(requiredMember(v, "y", p), ctx, `${p}.y`), z: parseCoordinate(requiredMember(v, "z", p), ctx, `${p}.z`), yaw: memberNumber(v, "yaw", 0, p), pitch, mode, audience };
    });
    const controllerCameras = out.cameras.filter(camera => isObject(camera.audience) && has(camera.audience, "interactionController"));
    if (controllerCameras.length > 0) {
      if (out.cameras.length !== 1) fail(`${api}.vanilla.cameras controller-audience camera must be the only camera declaration`);
      if (controllerCameras[0].mode === "spectate") fail(`${api}.vanilla.cameras controller-audience camera supports position_lock only`);
    } else validateDisjointAudiences(out.cameras, `${api}.vanilla.cameras`);
  }
  if (has(vanilla, "particles")) {
    if (ctx.version < 3) fail(`${api}.vanilla.particles requires portable version 3`);
    const values = requiredArray(vanilla, "particles", `${api}.vanilla`);
    if (values.length > LIMITS.particles) fail(`${api}.vanilla.particles exceeds max particle count ${LIMITS.particles}`);
    uniqueIds(values, `${api}.vanilla.particles`);
    out.particles = values.map((v, i) => {
      const p = `${api}.vanilla.particles[${i}]`, delta = parseVec3(v, "delta", { x: 0, y: 0, z: 0 }, p, false), speed = memberNumber(v, "speed", 0, p);
      if (delta.x < 0 || delta.y < 0 || delta.z < 0) fail(`${p}.delta components must be >= 0`);
      if (speed < 0 || speed > 100) fail(`${p}.speed must be between 0 and 100`);
      return { id: v.id, dimension: memberResource(v, "dimension", "minecraft:overworld", p), particle: memberResource(v, "particle", null, p), x: parseCoordinate(requiredMember(v, "x", p), ctx, `${p}.x`), y: parseCoordinate(requiredMember(v, "y", p), ctx, `${p}.y`), z: parseCoordinate(requiredMember(v, "z", p), ctx, `${p}.z`), delta, speed, count: memberBoundedInt(v, "count", 1, 1, 1000, p), force: memberBoolean(v, "force", false, p), condition: has(v, "when") ? parseCondition(requiredObject(v, "when", p), ctx, `${p}.when`) : null };
    });
  }
  if (has(vanilla, "sounds")) {
    if (ctx.version < 4) fail(`${api}.vanilla.sounds requires portable version 4`);
    const values = requiredArray(vanilla, "sounds", `${api}.vanilla`);
    if (values.length > LIMITS.sounds) fail(`${api}.vanilla.sounds exceeds max sound count ${LIMITS.sounds}`);
    uniqueIds(values, `${api}.vanilla.sounds`);
    out.sounds = values.map((v, i) => {
      const p = `${api}.vanilla.sounds[${i}]`, volume = memberNumber(v, "volume", 1, p), pitch = memberNumber(v, "pitch", 1, p);
      if (volume < 0 || volume > 100) fail(`${p}.volume must be between 0 and 100`); if (pitch < 0 || pitch > 2) fail(`${p}.pitch must be between 0 and 2`);
      return { id: v.id, dimension: memberResource(v, "dimension", "minecraft:overworld", p), sound: memberResource(v, "sound", null, p), x: parseCoordinate(requiredMember(v, "x", p), ctx, `${p}.x`), y: parseCoordinate(requiredMember(v, "y", p), ctx, `${p}.y`), z: parseCoordinate(requiredMember(v, "z", p), ctx, `${p}.z`), volume, pitch, condition: has(v, "when") ? parseCondition(requiredObject(v, "when", p), ctx, `${p}.when`) : null };
    });
  }
  if (has(vanilla, "huds")) {
    if (ctx.version < 4) fail(`${api}.vanilla.huds requires portable version 4`);
    const values = requiredArray(vanilla, "huds", `${api}.vanilla`); if (values.length > LIMITS.huds) fail(`${api}.vanilla.huds exceeds max HUD count ${LIMITS.huds}`); uniqueIds(values, `${api}.vanilla.huds`);
    out.huds = values.map((v, i) => ({ id: v.id, tokens: parseTokens(requiredArray(v, "tokens", `${api}.vanilla.huds[${i}]`), ctx, `${api}.vanilla.huds[${i}].tokens`) }));
  }
  if (has(vanilla, "playerHuds")) {
    if (ctx.version < 12) fail(`${api}.vanilla.playerHuds requires portable version 12`);
    const values = requiredArray(vanilla, "playerHuds", `${api}.vanilla`);
    const playerHudLimit = ctx.version >= 14 ? LIMITS.playerHuds : 1;
    if (values.length > playerHudLimit) fail(`${api}.vanilla.playerHuds exceeds max player HUD count ${playerHudLimit}`);
    uniqueIds(values, `${api}.vanilla.playerHuds`);
    out.playerHuds = values.map((v, i) => {
      const p = `${api}.vanilla.playerHuds[${i}]`, audience = parsePlayerSetRef(requiredMember(v, "audience", p), ctx, `${p}.audience`);
      let session = null, playerCtx = { ...ctx, playerScope: true, sessionScope: null };
      if (has(v, "session")) {
        if (ctx.version < 15) fail(`${p}.session requires portable version 15`);
        session = requiredString(v, "session", p);
        const declaration = ctx.sessions?.get(session);
        if (!declaration) fail(`${p}.session references unknown session ${session}`);
        if (playerSetKey(audience) !== playerSetKey(declaration.players)) fail(`${p}.audience must match session ${session}`);
        playerCtx = { ...playerCtx, sessionScope: session };
      }
      return { id: v.id, audience, session, tokens: parseTokens(requiredArray(v, "tokens", p), playerCtx, `${p}.tokens`) };
    });
    validateDisjointAudiences(out.playerHuds, `${api}.vanilla.playerHuds`);
    const playerHudValues = out.playerHuds.reduce((total, hud) => total + hud.tokens.filter(token => token.kind === "value").length, 0);
    if (playerHudValues > LIMITS.hudTokens) fail(`${api}.vanilla.playerHuds exceeds total numeric HUD value count ${LIMITS.hudTokens}`);
  }
  if (has(vanilla, "ownership")) {
    if (ctx.version < 10) fail(`${api}.vanilla.ownership requires portable version 10`);
    const v = requiredObject(vanilla, "ownership", `${api}.vanilla`), p = `${api}.vanilla.ownership`;
    const ownership = { dimension: memberResource(v, "dimension", "minecraft:overworld", p), minX: boundedInteger(requiredMember(v, "minX", p), -30000000, 30000000, `${p}.minX`), minZ: boundedInteger(requiredMember(v, "minZ", p), -30000000, 30000000, `${p}.minZ`), maxX: boundedInteger(requiredMember(v, "maxX", p), -30000000, 30000000, `${p}.maxX`), maxZ: boundedInteger(requiredMember(v, "maxZ", p), -30000000, 30000000, `${p}.maxZ`) };
    if (ownership.minX > ownership.maxX || ownership.minZ > ownership.maxZ) fail(`${p} requires minX <= maxX and minZ <= maxZ`);
    if ((floorDiv(ownership.maxX, 16) - floorDiv(ownership.minX, 16) + 1) * (floorDiv(ownership.maxZ, 16) - floorDiv(ownership.minZ, 16) + 1) > LIMITS.ownershipChunks) fail(`${p} exceeds max owned chunk count ${LIMITS.ownershipChunks}`);
    out.ownership = ownership;
  }
  if (has(vanilla, "sidebars")) {
    if (ctx.version < 9) fail(`${api}.vanilla.sidebars requires portable version 9`);
    const values = requiredArray(vanilla, "sidebars", `${api}.vanilla`); if (values.length > LIMITS.sidebars) fail(`${api}.vanilla.sidebars exceeds max sidebar count ${LIMITS.sidebars}`); uniqueIds(values, `${api}.vanilla.sidebars`);
    out.sidebars = values.map((v, i) => { const p = `${api}.vanilla.sidebars[${i}]`, title = requiredString(v, "title", p), rows = requiredArray(v, "rows", p); if (title.length > 128) fail(`${p}.title exceeds 128 characters`); if (rows.length < 1 || rows.length > LIMITS.sidebarRows) fail(`${p}.rows must contain 1..${LIMITS.sidebarRows} entries`); uniqueIds(rows, `${p}.rows`); return { id: v.id, title, rows: rows.map((row, j) => ({ id: row.id, tokens: parseTokens(requiredArray(row, "tokens", `${p}.rows[${j}]`), ctx, `${p}.rows[${j}].tokens`) })) }; });
  }
  return out;
}
