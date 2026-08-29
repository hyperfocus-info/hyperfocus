import { renderablePathCommand, renderableRecord, renderRecord, type PathCommand, type PooledRenderCommand, type Renderable, type RenderFramePool } from "@hyperfocus/engine/render";
import { type PlayerEntity } from "../../shared-contracts.ts";
import type { ClientImages } from "../assets.ts";
import { activeAbility, chargeMs, energyReady, rushMs } from "../combat-view.ts";
import { ACTOR_LABEL_DISTANCE, type ImpactActorVisual } from "./types.ts";
import { PLAYER_SIZE } from "../../data/entity-sizes.ts";

type RushDustParticle = { x: number; y: number; dirX: number; dirY: number; startedMs: number; seed: number };
type MovementGhost = { x: number; y: number; dirX: number; dirY: number; ability: string; weaponId: string; slot: string; startedMs: number; seed: number };
type PlayerPositionEntry = {
  x: number;
  y: number;
  ability?: string;
  activeMs?: number;
  activeSeenMs?: number;
  chargeMs?: number;
  chargeSeenMs?: number;
  facingX?: number;
  facingY?: number;
  movementCarry?: number;
  movementGhosts?: MovementGhost[];
  momentumDustLastMs?: number;
  rushDustCarry?: number;
  rushDust?: RushDustParticle[];
};
export type PlayerPositionCache = Map<string, PlayerPositionEntry>;
const PLAYER_RADIUS = PLAYER_SIZE.radius;
const PLAYER_DRAW_WIDTH = PLAYER_SIZE.width;
const PLAYER_DRAW_HEIGHT = PLAYER_SIZE.height;
const PUMMEL_MAX_CHARGE_MS = 2400;
const RUSH_DURATION_MS = 5000;
const RUSH_WINDUP_MS = 500;
const DEFAULT_PLAYER_PALETTE = { core: "245,243,232", accent: "183,214,255", shadow: "70,82,96" };
const PUMMEL_HIT_GRADIENT_STOPS: Array<[number, string]> = [[0, "rgba(244,211,107,0.12)"], [1, "rgba(244,211,107,0.028)"]];
const PUMMEL_HIT_DASH = [10, 8];
const movementDirectionScratch = { x: 1, y: 0 };
const facingDirectionScratch = { x: 0, y: 1 };
const FACING_EPSILON = 0.08;
const MOVEMENT_TRAIL_GRACE_MS = 180;
const MOVEMENT_GHOST_LIFETIME_MS = 320;
const MOVEMENT_GHOST_MAX = 8;
const RUSH_DUST_LIFETIME_MS = 260;
const RUSH_DUST_MAX = 16;
const WEAPON_PALETTES: Record<string, typeof DEFAULT_PLAYER_PALETTE> = {
  mace: { core: "244,211,107", accent: "255,243,184", shadow: "117,75,38" },
  bow: { core: "126,214,165", accent: "210,255,224", shadow: "44,94,69" },
  staff: { core: "167,199,255", accent: "223,236,255", shadow: "55,79,128" },
  wand: { core: "217,195,255", accent: "255,214,245", shadow: "86,64,132" },
  "twin-blades": { core: "255,126,182", accent: "255,224,240", shadow: "119,45,78" },
  blade: { core: "255,179,107", accent: "255,232,186", shadow: "123,70,42" }
};
const SLOT_ACCENTS: Record<string, string> = {
  LMB: "245,243,232",
  RMB: "255,179,107",
  Space: "155,214,255",
  Q: "217,195,255",
  E: "126,214,165",
  R: "244,211,107"
};

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function rgba(rgb: string, alpha: number) {
  return `rgba(${rgb},${clamp01(alpha)})`;
}

function pooledPoint(pool: RenderFramePool | undefined, x: number, y: number) {
  return pool ? pool.point(x, y) : { x, y };
}

function pooledArc(pool: RenderFramePool | undefined, x: number, y: number, radius: number, startAngle: number, endAngle: number, counterclockwise?: boolean) {
  const commands = pool ? pool.commands() : [];
  const command: PooledRenderCommand = pool?.command("arc") ?? { kind: "arc" };
  command.x = x;
  command.y = y;
  command.radius = radius;
  command.startAngle = startAngle;
  command.endAngle = endAngle;
  if (counterclockwise !== undefined) command.counterclockwise = counterclockwise;
  commands.push(renderablePathCommand(command));
  return commands;
}

function pushCommand(commands: PathCommand[], command: PooledRenderCommand) {
  commands.push(renderablePathCommand(command));
  return command;
}

function pushMoveTo(commands: PathCommand[], pool: RenderFramePool | undefined, x: number, y: number) {
  const command: PooledRenderCommand = pool?.command("moveTo") ?? { kind: "moveTo" };
  command.x = x;
  command.y = y;
  return pushCommand(commands, command);
}

function pushLineTo(commands: PathCommand[], pool: RenderFramePool | undefined, x: number, y: number) {
  const command: PooledRenderCommand = pool?.command("lineTo") ?? { kind: "lineTo" };
  command.x = x;
  command.y = y;
  return pushCommand(commands, command);
}

function pushArcCommand(commands: PathCommand[], pool: RenderFramePool | undefined, x: number, y: number, radius: number, startAngle: number, endAngle: number) {
  const command: PooledRenderCommand = pool?.command("arc") ?? { kind: "arc" };
  command.x = x;
  command.y = y;
  command.radius = radius;
  command.startAngle = startAngle;
  command.endAngle = endAngle;
  return pushCommand(commands, command);
}

function pushClosePath(commands: PathCommand[], pool: RenderFramePool | undefined) {
  return pushCommand(commands, pool?.command("closePath") ?? { kind: "closePath" });
}

function pushCircle(calls: Renderable[], pool: RenderFramePool | undefined, x: number, y: number, radius: number) {
  const call = renderRecord(pool, "circle");
  call.x = x;
  call.y = y;
  call.radius = radius;
  calls.push(renderableRecord(call));
  return call;
}

function pushEllipse(calls: Renderable[], pool: RenderFramePool | undefined, x: number, y: number, radiusX: number, radiusY: number) {
  const call = renderRecord(pool, "ellipse");
  call.x = x;
  call.y = y;
  call.radiusX = radiusX;
  call.radiusY = radiusY;
  calls.push(renderableRecord(call));
  return call;
}

function pushLine(calls: Renderable[], pool: RenderFramePool | undefined, x1: number, y1: number, x2: number, y2: number) {
  const call = renderRecord(pool, "line");
  call.x1 = x1;
  call.y1 = y1;
  call.x2 = x2;
  call.y2 = y2;
  calls.push(renderableRecord(call));
  return call;
}

function pushText(calls: Renderable[], pool: RenderFramePool | undefined, text: string, x: number, y: number, font: string) {
  const call = renderRecord(pool, "text");
  call.text = text;
  call.x = x;
  call.y = y;
  call.font = font;
  calls.push(renderableRecord(call));
  return call;
}

function pushPolygon(calls: Renderable[], pool: RenderFramePool | undefined, points: Array<{ x: number; y: number }>) {
  const call = renderRecord(pool, "polygon");
  call.points = points;
  calls.push(renderableRecord(call));
  return call;
}

function pushPath(calls: Renderable[], pool: RenderFramePool | undefined, commands: object[]) {
  const call = renderRecord(pool, "path");
  call.commands = commands;
  calls.push(renderableRecord(call));
  return call;
}

function compactRecentByStartedMs<T extends { startedMs: number }>(items: T[], timeMs: number, maxAgeMs: number, maxItems: number) {
  let write = 0;
  for (const item of items) {
    if (timeMs - item.startedMs >= maxAgeMs) continue;
    items[write] = item;
    write += 1;
  }
  if (write > maxItems) {
    const start = write - maxItems;
    for (let i = 0; i < maxItems; i += 1) items[i] = items[start + i];
    write = maxItems;
  }
  items.length = write;
  return items;
}

function chargeColor(t: number) {
  const r = Math.round(255 + (244 - 255) * t);
  const g = Math.round(255 + (211 - 255) * t);
  const b = Math.round(255 + (107 - 255) * t);
  return `rgba(${r},${g},${b},0.48)`;
}

function chargeMaxMsForAbility(ability: string) {
  if (ability === "mace-pummel") return PUMMEL_MAX_CHARGE_MS;
  if (ability === "mace-rock-smash" || ability === "bow-caltrops" || ability === "wand-enfeeble" || ability === "blade-razor-wind") return 1000;
  return 0;
}

function weaponIdForAbility(ability: string) {
  if (ability.startsWith("bow-")) return "bow";
  if (ability.startsWith("staff-")) return "staff";
  if (ability.startsWith("wand-")) return "wand";
  if (ability.startsWith("twin-")) return "twin-blades";
  if (ability.startsWith("blade-")) return "blade";
  if (ability.startsWith("mace-") || ability === "space-rush" || ability === "q-berserk") return "mace";
  return "";
}

function weaponIdForPlayer(actor: PlayerEntity) {
  const weaponId = actor.equippedWeaponId || actor.equipment?.weapon || "mace";
  return weaponId.length > 32 ? weaponId.slice(0, 32) : weaponId;
}

function paletteFor(actor: PlayerEntity, ability: string) {
  return WEAPON_PALETTES[weaponIdForAbility(ability) || weaponIdForPlayer(actor)] ?? DEFAULT_PLAYER_PALETTE;
}

function slotFor(actor: PlayerEntity, ability: string) {
  return actor.activeSlot || actor.abilitySlots?.[ability] || "";
}

function isMovementAfterimageAbility(ability: string) {
  return ability === "space-rush"
    || ability === "space-dash"
    || ability === "space-ghost-walk"
    || ability === "space-jump"
    || ability.includes("blink")
    || ability.includes("dash")
    || ability.includes("reposition")
    || ability.includes("vault")
    || ability.includes("roll")
    || ability.includes("lunge")
    || ability.includes("thrust")
    || ability.includes("leap")
    || ability.includes("omnislash")
    || ability.includes("swift-step")
    || ability.includes("assassinate")
    || ability.includes("astral-walk")
    || ability.includes("zephyr")
    || ability.includes("phase")
    || ability.includes("rewind");
}

function movementDirection(actor: PlayerEntity, dx: number, dy: number) {
  const out = movementDirectionScratch;
  const moved = Math.hypot(dx, dy);
  if (moved > 0.001) {
    out.x = dx / moved;
    out.y = dy / moved;
    return out;
  }
  const abilityLength = Math.hypot(actor.abilityVectorX || 0, actor.abilityVectorY || 0);
  if (abilityLength > 0.001) {
    out.x = (actor.abilityVectorX || 0) / abilityLength;
    out.y = (actor.abilityVectorY || 0) / abilityLength;
    return out;
  }
  const aimLength = Math.hypot(actor.aimX - actor.x, actor.aimY - actor.y);
  if (aimLength > 0.001) {
    out.x = (actor.aimX - actor.x) / aimLength;
    out.y = (actor.aimY - actor.y) / aimLength;
    return out;
  }
  out.x = 1;
  out.y = 0;
  return out;
}

function resolveFacing(actor: PlayerEntity, last: PlayerPositionEntry | undefined, dx: number, dy: number, active: string, charged: boolean) {
  const out = facingDirectionScratch;
  const aimLength = active || charged || actor.castMs > 0 || actor.action !== "idle" ? Math.hypot(actor.aimX - actor.x, actor.aimY - actor.y) : 0;
  if (aimLength > 3) {
    out.x = (actor.aimX - actor.x) / aimLength;
    out.y = (actor.aimY - actor.y) / aimLength;
    return out;
  }
  const abilityLength = active || charged || actor.castMs > 0 ? Math.hypot(actor.abilityVectorX || 0, actor.abilityVectorY || 0) : 0;
  if (abilityLength > FACING_EPSILON) {
    out.x = (actor.abilityVectorX || 0) / abilityLength;
    out.y = (actor.abilityVectorY || 0) / abilityLength;
    return out;
  }
  const moved = Math.hypot(dx, dy);
  if (moved > 0.45) {
    out.x = dx / moved;
    out.y = dy / moved;
    return out;
  }
  if (last && Math.hypot(last.facingX ?? 0, last.facingY ?? 0) > FACING_EPSILON) {
    out.x = last.facingX ?? 0;
    out.y = last.facingY ?? 1;
    return out;
  }
  out.x = 0;
  out.y = 1;
  return out;
}

function facingBucket(dirX: number, dirY: number) {
  if (Math.abs(dirX) > Math.abs(dirY) * 0.85) return dirX < 0 ? "left" : "right";
  return dirY < 0 ? "up" : "down";
}

function appendMovementAfterimage(calls: Renderable[], ghost: MovementGhost, timeMs: number, pool?: RenderFramePool) {
  const ageT = clamp01((timeMs - ghost.startedMs) / MOVEMENT_GHOST_LIFETIME_MS);
  const palette = WEAPON_PALETTES[weaponIdForAbility(ghost.ability) || ghost.weaponId] ?? DEFAULT_PLAYER_PALETTE;
  const sideX = -ghost.dirY;
  const sideY = ghost.dirX;
  const alpha = (1 - ageT) * (ghost.ability.includes("omnislash") ? 0.44 : ghost.ability === "space-rush" ? 0.34 : 0.3);
  const lean = 6.4 + ageT * 8;
  const shadow = pushEllipse(calls, pool, ghost.x - ghost.dirX * lean * 0.35, ghost.y + 11.2 - ghost.dirY * lean * 0.35, 10.4, 4);
  shadow.id = `movement-afterimage-shadow-${ghost.seed}`;
  shadow.fill = rgba(palette.shadow, alpha * 0.42);
  const points = pool ? pool.points(4) : [];
  points[0] = pooledPoint(pool, ghost.x - ghost.dirX * lean, ghost.y - 17.6 - ghost.dirY * lean);
  points[1] = pooledPoint(pool, ghost.x + sideX * 8.8 - ghost.dirX * 2.4, ghost.y - 4 + sideY * 8.8 - ghost.dirY * 2.4);
  points[2] = pooledPoint(pool, ghost.x + ghost.dirX * 6.4, ghost.y + 12 + ghost.dirY * 6.4);
  points[3] = pooledPoint(pool, ghost.x - sideX * 8.8 - ghost.dirX * 2.4, ghost.y - 4 - sideY * 8.8 - ghost.dirY * 2.4);
  const body = pushPolygon(calls, pool, points);
  body.id = `movement-afterimage-body-${ghost.seed}`;
  body.fill = rgba(palette.core, alpha);
  body.stroke = rgba(palette.accent, alpha * 0.9);
  body.lineWidth = 1;
  const cut = pushLine(calls, pool, ghost.x - sideX * 6.4 - ghost.dirX * 11.2, ghost.y + sideY * 6.4 - ghost.dirY * 11.2, ghost.x + sideX * 9.6 + ghost.dirX * 2.4, ghost.y - sideY * 9.6 + ghost.dirY * 2.4);
  cut.id = `movement-afterimage-cut-${ghost.seed}`;
  cut.stroke = rgba(palette.accent, alpha * 0.85);
  cut.lineWidth = 1.5;
  cut.cap = "round";
}

function appendMotionRibbon(calls: Renderable[], fromX: number, fromY: number, toX: number, toY: number, dirX: number, dirY: number, ability: string, palette: typeof DEFAULT_PLAYER_PALETTE, timeMs: number, pool?: RenderFramePool) {
  const sideX = -dirY;
  const sideY = dirX;
  const pulse = 0.5 + Math.sin(timeMs * 0.018) * 0.5;
  const width = ability === "space-rush" ? 6 : ability.includes("omnislash") ? 5 : 4;
  const wide = pushLine(calls, pool, fromX - sideX * 4, fromY + 8 - sideY * 4, toX - dirX * 4 - sideX * 1.6, toY + 8 - dirY * 4 - sideY * 1.6);
  wide.id = `motion-ribbon-wide-${ability}`;
  wide.stroke = rgba(palette.core, 0.18 + pulse * 0.08);
  wide.lineWidth = width;
  wide.cap = "round";
  const thin = pushLine(calls, pool, fromX + sideX * 6.4, fromY + 12.8 + sideY * 6.4, toX - dirX * 2.4 + sideX * 3.2, toY + 12.8 - dirY * 2.4 + sideY * 3.2);
  thin.id = `motion-ribbon-thin-${ability}`;
  thin.stroke = rgba(palette.accent, 0.2);
  thin.lineWidth = 2;
  thin.cap = "round";
}

function appendChargeSwirls(calls: Renderable[], actor: PlayerEntity, chargeT: number, timeMs: number, palette: typeof DEFAULT_PLAYER_PALETTE, slot: string, pool?: RenderFramePool) {
  const slotRgb = SLOT_ACCENTS[slot] ?? palette.accent;
  for (let i = 0; i < 3; i += 1) {
    const radius = 14.4 + i * 4 + Math.sin(timeMs * 0.006 + i) * 0.96;
    const spin = timeMs * (0.004 + i * 0.0009) * (i % 2 ? -1 : 1);
    const startAngle = spin + i * 2.1;
    const endAngle = startAngle + 0.85 + chargeT * (0.55 + i * 0.2);
    const swirl = pushPath(calls, pool, pooledArc(pool, actor.x, actor.y + 1.6, radius, startAngle, endAngle, i % 2 === 1));
    swirl.id = `charge-swirl-${i}`;
    swirl.stroke = rgba(i === 1 ? slotRgb : palette.core, 0.2 + chargeT * 0.3);
    swirl.lineWidth = 1.4 + i * 0.45;
    swirl.cap = "round";
  }
}

function appendPummelHitIndicator(calls: Renderable[], actor: PlayerEntity, chargeT: number, timeMs: number, pool?: RenderFramePool) {
  const rawDirX = actor.abilityVectorX || 0;
  const rawDirY = actor.abilityVectorY || 0;
  const dirLength = Math.hypot(rawDirX, rawDirY);
  const dirX = dirLength > 0 ? rawDirX / dirLength : 1;
  const dirY = dirLength > 0 ? rawDirY / dirLength : 0;
  const angle = Math.atan2(dirY, dirX);
  const range = 55 + chargeT * 57;
  const half = ((50 + chargeT * 40) * Math.PI) / 180;
  const left = angle - half;
  const right = angle + half;
  const tipX = actor.x + dirX * range;
  const tipY = actor.y + dirY * range;
  const commands = pool ? pool.commands() : [];
  pushMoveTo(commands, pool, actor.x, actor.y);
  pushLineTo(commands, pool, actor.x + Math.cos(left) * range, actor.y + Math.sin(left) * range);
  pushArcCommand(commands, pool, actor.x, actor.y, range, left, right);
  pushLineTo(commands, pool, actor.x, actor.y);
  pushClosePath(commands, pool);
  const fillGradient = renderRecord(pool, "linear-gradient");
  fillGradient.x0 = actor.x;
  fillGradient.y0 = actor.y;
  fillGradient.x1 = tipX;
  fillGradient.y1 = tipY;
  fillGradient.stops = PUMMEL_HIT_GRADIENT_STOPS;
  const fill = pushPath(calls, pool, commands);
  fill.id = "pummel-hit-indicator-fill";
  fill.fill = fillGradient;
  fill.stroke = "rgba(244,211,107,0.24)";
  fill.lineWidth = 1.1;
  const edge = pushPath(calls, pool, pooledArc(pool, actor.x, actor.y, range, left, right));
  edge.id = "pummel-hit-indicator-edge";
  edge.stroke = "rgba(255,243,184,0.62)";
  edge.lineWidth = 1.35;
  edge.cap = "round";
  edge.lineDash = PUMMEL_HIT_DASH;
  edge.lineDashOffset = -timeMs * 0.04;
  edge.shadowColor = "rgba(244,211,107,0.2)";
  edge.shadowBlur = 5;
}

function appendBodyAccent(calls: Renderable[], drawX: number, drawY: number, ability: string, slot: string, timeMs: number, palette: typeof DEFAULT_PLAYER_PALETTE, pool?: RenderFramePool) {
  const slotRgb = SLOT_ACCENTS[slot] ?? palette.accent;
  const pulse = 0.5 + Math.sin(timeMs * 0.018 + drawX) * 0.5;
  const aura = pushEllipse(calls, pool, drawX, drawY + 3.2, 10.4 + pulse * 1.44, 14.4);
  aura.id = `body-accent-aura-${ability || "idle"}`;
  aura.stroke = rgba(palette.core, 0.28 + pulse * 0.18);
  aura.shadowColor = rgba(palette.core, 0.62);
  aura.shadowBlur = 7;
  aura.lineWidth = 2;
  if (slot === "Space") {
    const space = pushEllipse(calls, pool, drawX, drawY + 13.6, 13.6, 4.8);
    space.id = "body-accent-space";
    space.stroke = rgba(slotRgb, 0.62);
    space.lineWidth = 2;
  } else if (slot === "R") {
    const ring = pushCircle(calls, pool, drawX, drawY + 0.8, 16.8);
    ring.id = "body-accent-r";
    ring.stroke = rgba(slotRgb, 0.42);
    ring.lineWidth = 2;
    const cut = pushLine(calls, pool, drawX - 12.8, drawY + 10.4, drawX + 12.8, drawY - 10.4);
    cut.id = "body-accent-r-cut";
    cut.stroke = rgba(slotRgb, 0.58);
    cut.lineWidth = 2;
    cut.cap = "round";
  } else if (slot === "Q") {
    const q = pushCircle(calls, pool, drawX, drawY - 5.6, 4.8);
    q.id = "body-accent-q";
    q.stroke = rgba(slotRgb, 0.65);
    q.lineWidth = 2;
  } else if (slot === "E") {
    const points = pool ? pool.points(4) : [];
    points[0] = pooledPoint(pool, drawX + 12, drawY - 0.8);
    points[1] = pooledPoint(pool, drawX + 16, drawY + 4);
    points[2] = pooledPoint(pool, drawX + 12, drawY + 8.8);
    points[3] = pooledPoint(pool, drawX + 8, drawY + 4);
    const diamond = pushPolygon(calls, pool, points);
    diamond.id = "body-accent-e";
    diamond.stroke = rgba(slotRgb, 0.62);
    diamond.fill = rgba(slotRgb, 0.16);
    diamond.lineWidth = 1.5;
  } else {
    const side = slot === "RMB" ? 1 : -1;
    const slash = pushLine(calls, pool, drawX - side * 3.2, drawY - 9.6, drawX + side * 10.4, drawY + 10.4);
    slash.id = `body-accent-${slot || "main"}`;
    slash.stroke = rgba(slotRgb, 0.62);
    slash.lineWidth = 2;
    slash.cap = "round";
  }
}

function appendFacingCue(calls: Renderable[], drawX: number, drawY: number, dirX: number, dirY: number, ability: string, slot: string, palette: typeof DEFAULT_PLAYER_PALETTE, pool?: RenderFramePool) {
  const sideX = -dirY;
  const sideY = dirX;
  const slotRgb = SLOT_ACCENTS[slot] ?? palette.accent;
  const points = pool ? pool.points(3) : [];
  const cueBaseX = drawX + dirX * (PLAYER_RADIUS + 6);
  const cueBaseY = drawY + 1.6 + dirY * (PLAYER_RADIUS + 6);
  points[0] = pooledPoint(pool, cueBaseX + dirX * 6.4, cueBaseY + dirY * 6.4);
  points[1] = pooledPoint(pool, cueBaseX - dirX * 4 + sideX * 5.2, cueBaseY - dirY * 4 + sideY * 5.2);
  points[2] = pooledPoint(pool, cueBaseX - dirX * 4 - sideX * 5.2, cueBaseY - dirY * 4 - sideY * 5.2);
  const stance = pushPolygon(calls, pool, points);
  stance.id = "player-facing-chevron";
  stance.fill = rgba(palette.core, ability ? 0.22 : 0.14);
  stance.stroke = rgba(slotRgb, ability ? 0.62 : 0.4);
  stance.lineWidth = 1.1;
}

function shouldDrawPlayerLabel(actor: PlayerEntity, focusPlayer: PlayerEntity | undefined) {
  if (!focusPlayer) return false;
  if (actor.id === focusPlayer.id) return true;
  return Math.hypot(actor.x - focusPlayer.x, actor.y - focusPlayer.y) <= ACTOR_LABEL_DISTANCE;
}

export function createPlayerRenderCalls(
  actor: PlayerEntity,
  images: ClientImages,
  timeMs: number,
  focusPlayer: PlayerEntity | undefined,
  clientPlayerId: string | undefined,
  lastPositions: PlayerPositionCache,
  out: Renderable[] = [],
  pool?: RenderFramePool,
  impact?: ImpactActorVisual
): Renderable[] {
  const calls = pool ? pool.array() : [];
  const isSelf = actor.id === clientPlayerId;
  const last = lastPositions.get(actor.id);
  const previousX = last?.x ?? actor.x;
  const previousY = last?.y ?? actor.y;
  const previousAbility = last?.ability ?? "";
  const previousActiveSeenMs = last?.activeSeenMs ?? timeMs;
  const movedSinceLastFrame = last ? Math.hypot(actor.x - last.x, actor.y - last.y) : 0;
  const isRunning = movedSinceLastFrame > 0.35;
  const ability = activeAbility(actor);
  const activeSlot = slotFor(actor, ability);
  const palette = paletteFor(actor, ability);
  const serverActiveMs = typeof actor.activeMs === "number" ? actor.activeMs : 0;
  const serverChargeMs = chargeMs(actor);
  syncPlayerActivity(last, previousAbility, ability, serverActiveMs, serverChargeMs, timeMs);
  const chargeMaxMs = chargeMaxMsForAbility(ability);
  const activeDurationMs = Math.max(1, typeof actor.activeDurationMs === "number" ? actor.activeDurationMs : ability === "space-rush" ? RUSH_DURATION_MS : 1);
  const visualActiveMs = last && ability
    ? clamp01(((last.activeMs ?? serverActiveMs) + Math.max(0, timeMs - (last.activeSeenMs ?? timeMs))) / activeDurationMs) * activeDurationMs
    : serverActiveMs;
  const charge = last && chargeMaxMs > 0 && serverChargeMs > 0
    ? Math.min(chargeMaxMs, (last.chargeMs ?? serverChargeMs) + Math.max(0, timeMs - (last.chargeSeenMs ?? timeMs)))
    : chargeMaxMs > 0 ? serverChargeMs : 0;
  const drawingCharge = chargeMaxMs > 0 && charge > 0;
  const rushing = ability === "space-rush" || rushMs(actor) > 0;
  const facing = resolveFacing(actor, last, actor.x - previousX, actor.y - previousY, ability, drawingCharge);
  const facingX = facing.x;
  const facingY = facing.y;
  const facingKey = facingBucket(facingX, facingY);
  const castLean = actor.castMs > 0 ? Math.sin(timeMs * 0.018 + actor.x * 0.01) * 0.42 : 0;
  const chargeLean = drawingCharge ? Math.sin(timeMs * 0.012 + charge * 0.003) * 0.35 : 0;
  const actionLean = castLean + chargeLean;
  const visualX = impact?.x ?? actor.x;
  const visualY = impact?.y ?? actor.y;
  const drawX = visualX - facingX * actionLean + (impact?.offsetX ?? 0);
  const drawY = visualY - facingY * actionLean + (actor.stunMs > 0 ? Math.sin(timeMs * 0.025) * 1.5 : 0) + (impact?.offsetY ?? 0);
  const previousMovementFresh = Boolean(last && movedSinceLastFrame > 3 && isMovementAfterimageAbility(previousAbility) && timeMs - previousActiveSeenMs <= MOVEMENT_TRAIL_GRACE_MS);
  const movementAbility = isMovementAfterimageAbility(ability)
    ? ability
    : previousMovementFresh
      ? previousAbility
      : "";
  updatePlayerMovementEffects({
    actor,
    timeMs,
    last,
    lastPositions,
    calls,
    pool,
    movedSinceLastFrame,
    movementAbility,
    activeSlot,
    previousX,
    previousY,
    rushing,
    chargeMaxMs,
    ability,
    serverActiveMs,
    serverChargeMs,
    facingX,
    facingY,
  });

  appendRushAndPummelOverlays(
    calls, actor, rushing, visualActiveMs, activeDurationMs, facingX, facingY,
    drawingCharge, ability, charge, chargeMaxMs, timeMs, pool,
  );

  if (images.hero) {
    const frameW = images.hero.height;
    const frameCount = Math.max(1, Math.floor(images.hero.width / frameW));
    const actionAnimating = Boolean(isRunning || ability || drawingCharge || actor.castMs > 0);
    const frame = actionAnimating ? Math.floor(timeMs / (isRunning ? 100 : 120)) % frameCount : 0;
    if (actor.prestigeTitle) {
      const points = pool ? pool.points(3) : [];
      points[0] = pooledPoint(pool, drawX - 7.2, drawY - 12);
      points[1] = pooledPoint(pool, drawX - 20.8, drawY + 9.6);
      points[2] = pooledPoint(pool, drawX - 4.8, drawY + 16);
      const title = pushPolygon(calls, pool, points);
      title.fill = "rgba(129, 90, 208, 0.78)";
    }
    const hero = renderRecord(pool, "sprite");
    hero.image = images.hero;
    hero.x = drawX;
    hero.y = drawY - 20.8;
    hero.width = PLAYER_DRAW_WIDTH;
    hero.height = PLAYER_DRAW_HEIGHT;
    hero.anchor = "top";
    hero.sourceX = frame * frameW;
    hero.sourceY = 0;
    hero.sourceWidth = frameW;
    hero.sourceHeight = images.hero.height;
    hero.flipX = facingKey === "left";
    calls.push(renderableRecord(hero));
  } else if (isSelf) {
    const sideX = -facingY;
    const sideY = facingX;
    const points = pool ? pool.points(4) : [];
    points[0] = pooledPoint(pool, drawX + facingX * 10, drawY + facingY * 10);
    points[1] = pooledPoint(pool, drawX + sideX * 8 - facingX * 1.2, drawY + sideY * 8 - facingY * 1.2);
    points[2] = pooledPoint(pool, drawX - facingX * 10, drawY - facingY * 10);
    points[3] = pooledPoint(pool, drawX - sideX * 8 - facingX * 1.2, drawY - sideY * 8 - facingY * 1.2);
    const self = pushPolygon(calls, pool, points);
    self.fill = "#f5f3e8";
  } else {
    const other = pushCircle(calls, pool, drawX, drawY, 8);
    other.fill = "#7db4ff";
  }
  appendFacingCue(calls, drawX, drawY, facingX, facingY, ability, activeSlot, palette, pool);
  if (isSelf) {
    const selfShadow = pushEllipse(calls, pool, actor.x, actor.y + 11.2, 10.4, 4);
    selfShadow.stroke = "rgba(255,255,255,0.58)";
    selfShadow.lineWidth = 2;
  } else {
    const otherRing = pushCircle(calls, pool, actor.x, actor.y, 12);
    otherRing.stroke = "#b7d6ff";
    otherRing.lineWidth = 1;
  }
  if (actor.guardMs > 0 || actor.berserkMs > 0) {
    const status = pushCircle(calls, pool, actor.x, actor.y + 1.6, actor.guardMs > 0 ? 16 : 13.6 + Math.sin(timeMs * 0.016) * 1.2);
    status.stroke = actor.guardMs > 0 ? "#9bd6ff" : "#ffb36b";
    status.shadowColor = actor.guardMs > 0 ? "rgba(155, 214, 255, 0.78)" : "rgba(255, 179, 107, 0.72)";
    status.shadowBlur = 10;
    status.lineWidth = 2;
  }
  if (ability || drawingCharge || actor.iframeMs > 0) appendBodyAccent(calls, drawX, drawY, ability, activeSlot, timeMs, palette, pool);
  if (drawingCharge) {
    const chargeT = Math.min(1, charge / chargeMaxMs);
    appendChargeSwirls(calls, actor, chargeT, timeMs, palette, activeSlot, pool);
    const chargeRing = pushPath(calls, pool, pooledArc(pool, actor.x, actor.y + 1.6, 20, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * chargeT));
    chargeRing.id = "charge-ring";
    chargeRing.stroke = chargeColor(chargeT);
    chargeRing.lineWidth = 3;
    chargeRing.cap = "round";
  }
  if (isSelf && energyReady(actor)) {
    const ready = pushText(calls, pool, "R", actor.x + 14.4, actor.y - 19.2, "800 11px system-ui");
    ready.align = "center";
    ready.fill = "#f4d36b";
  }
  if (actor.iframeMs > 0) {
    const iframe = pushCircle(calls, pool, actor.x, actor.y + 1.6, 16.8);
    iframe.stroke = "rgba(183,214,255,0.76)";
    iframe.lineWidth = 2;
  }
  if (actor.stunMs > 0) {
    const stun = pushText(calls, pool, "*", actor.x, actor.y - 35.2, "800 16px system-ui");
    stun.align = "center";
    stun.fill = "#fff3b8";
  }
  const hp = renderRecord(pool, "bar");
  hp.x = actor.x - 14.4;
  hp.y = actor.y - 25.6;
  hp.width = 28.8;
  hp.height = 3.2;
  hp.value = actor.hp;
  hp.max = actor.maxHp;
  hp.background = "rgba(0,0,0,0.55)";
  hp.fill = "#75d36f";
  calls.push(renderableRecord(hp));
  if (shouldDrawPlayerLabel(actor, focusPlayer)) {
    const name = pushText(calls, pool, actor.name, actor.x, actor.y - 30.4, "12px system-ui");
    name.align = "center";
    name.fill = "#fff7df";
    if (actor.prestigeTitle) {
      const title = pushText(calls, pool, actor.prestigeTitle, actor.x, actor.y - 40, "10px system-ui");
      title.align = "center";
      title.fill = "#d9c3ff";
    }
  }
  const group = renderRecord(pool, "group");
  group.id = actor.id;
  group.x = actor.x;
  group.y = actor.y;
  group.ySort = actor.y;
  group.calls = calls;
  out.push(renderableRecord(group));
  return out;
}

function appendRushAndPummelOverlays(
  calls: Renderable[],
  actor: PlayerEntity,
  rushing: boolean,
  visualActiveMs: number,
  activeDurationMs: number,
  facingX: number,
  facingY: number,
  drawingCharge: boolean,
  ability: string,
  charge: number,
  chargeMaxMs: number,
  timeMs: number,
  pool: RenderFramePool | undefined,
) {
  if (rushing) {
    const rushT = clamp01((visualActiveMs - RUSH_WINDUP_MS) / Math.max(1, activeDurationMs - RUSH_WINDUP_MS));
    const hitRadius = PLAYER_RADIUS * 1.2 * (1 + rushT * 1.5);
    const tailX = actor.x - facingX * 18;
    const tailY = actor.y - facingY * 18 + 8;
    const rushRing = pushCircle(calls, pool, actor.x, actor.y + 1.6, hitRadius);
    rushRing.stroke = "rgba(155,214,255,0.34)";
    rushRing.lineWidth = 1.5;
    const rushTail = pushLine(calls, pool, tailX, tailY + 9.6, actor.x, actor.y + 9.6);
    rushTail.stroke = "rgba(155, 214, 255, 0.22)";
    rushTail.lineWidth = 3;
    rushTail.cap = "round";
    const rushCore = pushLine(calls, pool, tailX - 6.4, tailY + 12.8, actor.x - 2.4, actor.y + 12.8);
    rushCore.stroke = "rgba(245, 243, 232, 0.16)";
    rushCore.lineWidth = 1.5;
    rushCore.cap = "round";
  }
  if (drawingCharge && ability === "mace-pummel") {
    appendPummelHitIndicator(calls, actor, Math.min(1, charge / chargeMaxMs), timeMs, pool);
  }
}

function syncPlayerActivity(
  last: PlayerPositionEntry | undefined,
  previousAbility: string,
  ability: string,
  serverActiveMs: number,
  serverChargeMs: number,
  timeMs: number,
) {
  if (!last) return;
  if (previousAbility && previousAbility !== ability) {
    last.movementCarry = 0;
    last.rushDustCarry = 0;
    if (last.rushDust) last.rushDust.length = 0;
    if (last.movementGhosts?.length) {
      compactRecentByStartedMs(last.movementGhosts, timeMs, MOVEMENT_TRAIL_GRACE_MS, 4);
    }
  }
  if (last.ability !== ability || serverActiveMs < (last.activeMs ?? 0)) {
    last.ability = ability;
    last.activeMs = serverActiveMs;
    last.activeSeenMs = timeMs;
    last.chargeMs = serverChargeMs;
    last.chargeSeenMs = timeMs;
    return;
  }
  if (serverActiveMs > (last.activeMs ?? 0) + 0.5) {
    last.activeMs = serverActiveMs;
    last.activeSeenMs = timeMs;
  }
  if (serverChargeMs > (last.chargeMs ?? 0) + 0.5 || serverChargeMs < (last.chargeMs ?? 0)) {
    last.chargeMs = serverChargeMs;
    last.chargeSeenMs = timeMs;
  }
}

function updatePlayerMovementEffects(input: {
  actor: PlayerEntity;
  timeMs: number;
  last: PlayerPositionEntry | undefined;
  lastPositions: PlayerPositionCache;
  calls: Renderable[];
  pool: RenderFramePool | undefined;
  movedSinceLastFrame: number;
  movementAbility: string;
  activeSlot: string;
  previousX: number;
  previousY: number;
  rushing: boolean;
  chargeMaxMs: number;
  ability: string;
  serverActiveMs: number;
  serverChargeMs: number;
  facingX: number;
  facingY: number;
}) {
  const { actor, last, timeMs, pool } = input;
  if (!last) {
    input.lastPositions.set(actor.id, {
      x: actor.x,
      y: actor.y,
      ability: input.ability,
      activeMs: input.serverActiveMs,
      activeSeenMs: timeMs,
      chargeMs: input.serverChargeMs,
      chargeSeenMs: timeMs,
      facingX: input.facingX,
      facingY: input.facingY
    });
    return;
  }

  const dx = actor.x - input.previousX;
  const dy = actor.y - input.previousY;
  const moveDir = movementDirection(actor, dx, dy);
  if (input.movementAbility && input.movedSinceLastFrame > 1.4) {
    const movementPalette = paletteFor(actor, input.movementAbility);
    const movementSlot = input.activeSlot || slotFor(actor, input.movementAbility);
    const spacing = input.movementAbility === "space-rush" ? 30 : input.movementAbility.includes("omnislash") ? 16 : 22;
    appendMotionRibbon(input.calls, input.previousX, input.previousY, actor.x, actor.y, moveDir.x, moveDir.y, input.movementAbility, movementPalette, timeMs, pool);
    last.movementCarry = (last.movementCarry ?? 0) + input.movedSinceLastFrame;
    let spawnedGhosts = 0;
    while ((last.movementCarry ?? 0) >= spacing && spawnedGhosts < 4) {
      last.movementCarry = (last.movementCarry ?? 0) - spacing;
      const backtrack = Math.min(input.movedSinceLastFrame, spacing * (spawnedGhosts + 1));
      const ratio = input.movedSinceLastFrame > 0 ? clamp01(backtrack / input.movedSinceLastFrame) : 0;
      last.movementGhosts ??= [];
      last.movementGhosts.push({
        x: actor.x - dx * ratio,
        y: actor.y - dy * ratio,
        dirX: moveDir.x,
        dirY: moveDir.y,
        ability: input.movementAbility,
        weaponId: weaponIdForPlayer(actor),
        slot: movementSlot,
        startedMs: timeMs - spawnedGhosts * 28,
        seed: Math.floor(timeMs + spawnedGhosts * 53 + actor.x * 7 + actor.y * 3)
      });
      spawnedGhosts += 1;
    }
  } else if (!input.movementAbility) {
    last.movementCarry = 0;
  }
  if (last.movementGhosts?.length) {
    compactRecentByStartedMs(last.movementGhosts, timeMs, MOVEMENT_GHOST_LIFETIME_MS, MOVEMENT_GHOST_MAX);
    for (const ghost of last.movementGhosts) appendMovementAfterimage(input.calls, ghost, timeMs, pool);
  }
  updateRushDust(input, last);
  if (input.chargeMaxMs <= 0) {
    last.chargeMs = 0;
    last.chargeSeenMs = timeMs;
  }
  last.x = actor.x;
  last.y = actor.y;
  last.facingX = input.facingX;
  last.facingY = input.facingY;
}

function updateRushDust(
  input: Parameters<typeof updatePlayerMovementEffects>[0],
  last: PlayerPositionEntry,
) {
  const { actor, timeMs, pool } = input;
  if (input.rushing && input.movedSinceLastFrame > 0) {
    const maxRushSpeed = (118 + Math.min(38, actor.combatLevel * 2) + Math.min(14, Math.max(0, actor.masteryRank - 1) * 2)) * 5;
    const threshold = Math.max(80, maxRushSpeed * 0.25);
    last.rushDustCarry = (last.rushDustCarry ?? 0) + input.movedSinceLastFrame;
    const dirLength = Math.hypot(actor.abilityVectorX || 0, actor.abilityVectorY || 0) || 1;
    const dirX = (actor.abilityVectorX || 1) / dirLength;
    const dirY = (actor.abilityVectorY || 0) / dirLength;
    let spawned = 0;
    while ((last.rushDustCarry ?? 0) >= threshold && spawned < 2) {
      last.rushDustCarry = (last.rushDustCarry ?? 0) - threshold;
      const baseX = actor.x - dirX * (14.4 + spawned * 4);
      const baseY = actor.y - dirY * (14.4 + spawned * 4) + 7.2;
      for (let index = 0; index < 3; index += 1) {
        const side = index - 1;
        last.rushDust ??= [];
        last.rushDust.push({
          x: baseX + -dirY * side * 3.2,
          y: baseY + dirX * side * 3.2,
          dirX,
          dirY,
          startedMs: timeMs,
          seed: Math.floor(timeMs + index * 37 + actor.x * 3)
        });
      }
      spawned += 1;
    }
  } else if (!input.rushing) {
    last.rushDustCarry = 0;
  }
  const momentumSpeed = Math.hypot(actor.momentumX ?? 0, actor.momentumY ?? 0);
  const maxMomentumSpeed = (118 + Math.min(38, actor.combatLevel * 2) + Math.min(14, Math.max(0, actor.masteryRank - 1) * 2)) * 1.25;
  if (!input.rushing && momentumSpeed >= maxMomentumSpeed * 0.92 && timeMs - (last.momentumDustLastMs ?? -Infinity) >= 250) {
    const dirX = (actor.momentumX ?? 0) / (momentumSpeed || 1);
    const dirY = (actor.momentumY ?? 0) / (momentumSpeed || 1);
    last.rushDust ??= [];
    for (let index = 0; index < 4; index += 1) {
      const side = index - 1.5;
      last.rushDust.push({
        x: actor.x - dirX * 12 + -dirY * side * 3.4,
        y: actor.y + 8 - dirY * 12 + dirX * side * 3.4,
        dirX,
        dirY,
        startedMs: timeMs,
        seed: Math.floor(timeMs + index * 41 + actor.x * 5)
      });
    }
    last.momentumDustLastMs = timeMs;
  }
  if (!last.rushDust?.length) return;
  compactRecentByStartedMs(last.rushDust, timeMs, RUSH_DUST_LIFETIME_MS, RUSH_DUST_MAX);
  for (const dust of last.rushDust) {
    const t = clamp01((timeMs - dust.startedMs) / RUSH_DUST_LIFETIME_MS);
    const drift = 4.8 + t * (12 + (dust.seed % 7) * 0.64);
    const side = Math.sin(dust.seed) * 5.6 * t;
    const x = dust.x - dust.dirX * drift + -dust.dirY * side;
    const y = dust.y - dust.dirY * drift + dust.dirX * side;
    const tail = 4.8 + (dust.seed % 3) * 1.2;
    const dustCall = pushLine(input.calls, pool, x, y, x - dust.dirX * tail, y - dust.dirY * tail);
    dustCall.stroke = `rgba(155,214,255,${0.34 * (1 - t)})`;
    dustCall.lineWidth = 1.2;
    dustCall.cap = "round";
  }
}
