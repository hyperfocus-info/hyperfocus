import { renderRecord, type PathCommand, type Renderable, type RenderFramePool } from "@hyperfocus/engine/render";
import type { HazardEntity } from "../../shared.ts";

export type HazardRenderTiming = {
  ageMs: number;
  windupMs: number;
  lifetimeMs: number;
};

type HazardTimingState = {
  armed: boolean;
  warning: number;
  lifeT: number;
};

type ProjectileVisual = {
  core: string;
  glow: string;
  trail: string;
  ribbon: string;
  accent: string;
  shadow: string;
};

type LineVisual = {
  core: string;
  glow: string;
  trail: string;
  ribbon: string;
  accent: string;
  shadow: string;
};

type MeleeWaveVisual = {
  mode: "cone" | "twin" | "blade";
  core: string;
  hot: string;
  glow: string;
  fillBase: string;
  fillTip: string;
  dash: string;
  shadow: string;
  accent: string;
};

let activeRenderPool: RenderFramePool | undefined;
const timingScratch: HazardTimingState = { armed: false, warning: 0, lifeT: 0 };
const lineMetricsScratch = { dx: 1, dy: 0, px: 0, py: 1, length: 1 };

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function timingFor(hazard: HazardEntity, timing?: HazardRenderTiming): HazardTimingState {
  if (!timing) {
    const armed = hazard.windupMs <= 0;
    const warning = clamp01(1 - hazard.windupMs / (hazard.kind === "aoe" ? 850 : 520));
    timingScratch.armed = armed;
    timingScratch.warning = warning;
    timingScratch.lifeT = 0;
    return timingScratch;
  }
  const windupMs = Math.max(0, timing.windupMs);
  const lifetimeMs = Math.max(1, timing.lifetimeMs);
  const ageMs = Math.max(0, timing.ageMs);
  const armed = ageMs >= windupMs;
  const warning = windupMs <= 0 ? 1 : clamp01(ageMs / windupMs);
  const lifeT = armed ? clamp01((ageMs - windupMs) / lifetimeMs) : 0;
  timingScratch.armed = armed;
  timingScratch.warning = warning;
  timingScratch.lifeT = lifeT;
  return timingScratch;
}

const PLAYER_PROJECTILE_PALETTES: Record<string, ProjectileVisual> = {
  "arcane-bolt": { core: "#f4ecff", glow: "rgba(160,130,255,0.26)", trail: "rgba(220,205,255,0.72)", ribbon: "rgba(119,96,255,0.22)", accent: "#b99cff", shadow: "rgba(176,150,255,0.72)" },
  frost: { core: "#e2fbff", glow: "rgba(95,205,255,0.24)", trail: "rgba(190,244,255,0.72)", ribbon: "rgba(68,188,255,0.2)", accent: "#7de8ff", shadow: "rgba(120,230,255,0.68)" },
  missile: { core: "#fff7d2", glow: "rgba(244,211,107,0.24)", trail: "rgba(255,243,184,0.72)", ribbon: "rgba(255,178,74,0.2)", accent: "#ffd36e", shadow: "rgba(255,218,122,0.66)" },
  hex: { core: "#f1d4ff", glow: "rgba(160,84,210,0.26)", trail: "rgba(218,164,255,0.68)", ribbon: "rgba(124,61,188,0.22)", accent: "#c978ff", shadow: "rgba(190,108,255,0.7)" },
  mend: { core: "#d6ffe4", glow: "rgba(95,220,150,0.24)", trail: "rgba(176,255,206,0.7)", ribbon: "rgba(72,208,122,0.2)", accent: "#9ff2c0", shadow: "rgba(132,255,184,0.64)" },
  "focused-ray": { core: "#ffffff", glow: "rgba(140,210,255,0.28)", trail: "rgba(225,245,255,0.86)", ribbon: "rgba(96,190,255,0.24)", accent: "#aee9ff", shadow: "rgba(170,232,255,0.78)" },
  chaos: { core: "#ffd7ef", glow: "rgba(255,98,180,0.24)", trail: "rgba(255,190,232,0.7)", ribbon: "rgba(255,90,126,0.2)", accent: "#ff8bd4", shadow: "rgba(255,120,202,0.7)" },
  dirk: { core: "#f7f7e8", glow: "rgba(210,215,195,0.22)", trail: "rgba(245,245,220,0.66)", ribbon: "rgba(190,198,185,0.18)", accent: "#d8ded0", shadow: "rgba(238,238,210,0.48)" },
  knife: { core: "#f7f7e8", glow: "rgba(210,215,195,0.2)", trail: "rgba(245,245,220,0.62)", ribbon: "rgba(190,198,185,0.18)", accent: "#d8ded0", shadow: "rgba(238,238,210,0.46)" },
  "noxious-flask": { core: "#d8ff9a", glow: "rgba(90,210,90,0.28)", trail: "rgba(160,235,120,0.7)", ribbon: "rgba(84,180,62,0.24)", accent: "#7ced62", shadow: "rgba(134,255,96,0.64)" },
  razor: { core: "#fff7df", glow: "rgba(245,214,142,0.24)", trail: "rgba(247,240,214,0.72)", ribbon: "rgba(230,186,95,0.2)", accent: "#f4d36b", shadow: "rgba(255,230,160,0.62)" }
};

const LINE_VISUALS: Record<string, LineVisual> = {
  arrow: { core: "#fff3b8", glow: "rgba(244,211,107,0.18)", trail: "rgba(232,200,118,0.5)", ribbon: "rgba(118,96,58,0.2)", accent: "#f7f0d6", shadow: "rgba(244,211,107,0.5)" },
  piercearrow: { core: "#ffffff", glow: "rgba(255,230,156,0.22)", trail: "rgba(255,243,184,0.58)", ribbon: "rgba(238,180,82,0.22)", accent: "#f4d36b", shadow: "rgba(255,226,148,0.6)" },
  root: { core: "#d4ffb4", glow: "rgba(111,191,115,0.2)", trail: "rgba(169,216,143,0.58)", ribbon: "rgba(70,126,66,0.22)", accent: "#a9d88f", shadow: "rgba(152,230,126,0.48)" },
  siphon: { core: "#ffd5e2", glow: "rgba(190,78,122,0.22)", trail: "rgba(255,146,180,0.54)", ribbon: "rgba(114,45,95,0.22)", accent: "#ff8bb4", shadow: "rgba(255,116,162,0.56)" },
  soulbind: { core: "#ead5ff", glow: "rgba(170,98,230,0.22)", trail: "rgba(214,164,255,0.54)", ribbon: "rgba(92,56,150,0.22)", accent: "#c978ff", shadow: "rgba(198,128,255,0.56)" },
  deathmark: { core: "#ffd7d7", glow: "rgba(240,78,78,0.24)", trail: "rgba(255,124,124,0.56)", ribbon: "rgba(130,36,54,0.22)", accent: "#ff7e68", shadow: "rgba(255,102,102,0.58)" },
  heal: { core: "#e8ffe8", glow: "rgba(106,228,142,0.2)", trail: "rgba(176,255,206,0.58)", ribbon: "rgba(78,180,104,0.2)", accent: "#9ff2c0", shadow: "rgba(130,255,180,0.52)" },
  apotheosis: { core: "#fff7d6", glow: "rgba(255,224,124,0.24)", trail: "rgba(255,242,172,0.62)", ribbon: "rgba(255,198,76,0.22)", accent: "#f4d36b", shadow: "rgba(255,226,128,0.58)" },
  phase: { core: "#ddfbff", glow: "rgba(110,210,255,0.22)", trail: "rgba(178,236,255,0.58)", ribbon: "rgba(80,134,220,0.22)", accent: "#8be7ff", shadow: "rgba(120,225,255,0.58)" },
  rewind: { core: "#f2ecff", glow: "rgba(154,128,255,0.22)", trail: "rgba(206,190,255,0.58)", ribbon: "rgba(87,108,224,0.2)", accent: "#b99cff", shadow: "rgba(178,150,255,0.56)" },
  frost: { core: "#e2fbff", glow: "rgba(95,205,255,0.22)", trail: "rgba(190,244,255,0.6)", ribbon: "rgba(68,188,255,0.2)", accent: "#7de8ff", shadow: "rgba(120,230,255,0.58)" },
  phasewalk: { core: "#ddfbff", glow: "rgba(110,210,255,0.22)", trail: "rgba(178,236,255,0.58)", ribbon: "rgba(80,134,220,0.22)", accent: "#8be7ff", shadow: "rgba(120,225,255,0.58)" },
  icewall: { core: "#f4fdff", glow: "rgba(130,230,255,0.28)", trail: "rgba(190,244,255,0.64)", ribbon: "rgba(80,170,220,0.24)", accent: "#9eefff", shadow: "rgba(160,240,255,0.7)" },
  dust: { core: "#fff0c2", glow: "rgba(190,162,112,0.18)", trail: "rgba(214,186,112,0.5)", ribbon: "rgba(126,92,58,0.2)", accent: "#d6ba70", shadow: "rgba(214,186,112,0.44)" },
  void: { core: "#e6d7ff", glow: "rgba(142,108,255,0.24)", trail: "rgba(185,156,255,0.58)", ribbon: "rgba(70,54,146,0.24)", accent: "#b99cff", shadow: "rgba(168,136,255,0.62)" },
  spark: { core: "#fff3b8", glow: "rgba(244,211,107,0.24)", trail: "rgba(255,180,90,0.56)", ribbon: "rgba(170,90,54,0.22)", accent: "#ffb36b", shadow: "rgba(255,205,108,0.58)" }
};

const MELEE_WAVE_VISUALS: Record<string, MeleeWaveVisual> = {
  conewave: { mode: "cone", core: "rgba(244,211,107,0.48)", hot: "rgba(255,255,255,0.72)", glow: "rgba(244,211,107,0.18)", fillBase: "rgba(244,211,107,0.13)", fillTip: "rgba(244,211,107,0.035)", dash: "rgba(255,243,184,0.64)", shadow: "rgba(0,0,0,0.2)", accent: "rgba(255,179,107,0.62)" },
  nightmare: { mode: "cone", core: "rgba(201,120,255,0.48)", hot: "rgba(255,240,255,0.7)", glow: "rgba(142,108,255,0.18)", fillBase: "rgba(160,84,210,0.13)", fillTip: "rgba(160,84,210,0.035)", dash: "rgba(241,212,255,0.62)", shadow: "rgba(0,0,0,0.2)", accent: "rgba(201,120,255,0.6)" },
  petrify: { mode: "cone", core: "rgba(220,230,210,0.42)", hot: "rgba(255,255,238,0.66)", glow: "rgba(190,205,180,0.15)", fillBase: "rgba(190,205,180,0.12)", fillTip: "rgba(190,205,180,0.03)", dash: "rgba(245,245,220,0.58)", shadow: "rgba(0,0,0,0.2)", accent: "rgba(214,186,112,0.52)" },
  twinwave: { mode: "twin", core: "rgba(245,245,220,0.5)", hot: "rgba(255,255,255,0.74)", glow: "rgba(210,215,195,0.14)", fillBase: "rgba(245,245,220,0.11)", fillTip: "rgba(245,245,220,0.028)", dash: "rgba(255,255,255,0.62)", shadow: "rgba(0,0,0,0.2)", accent: "rgba(216,222,208,0.64)" },
  toxicwave: { mode: "twin", core: "rgba(168,255,126,0.48)", hot: "rgba(235,255,208,0.72)", glow: "rgba(90,210,90,0.16)", fillBase: "rgba(112,214,72,0.12)", fillTip: "rgba(112,214,72,0.03)", dash: "rgba(216,255,154,0.62)", shadow: "rgba(0,0,0,0.2)", accent: "rgba(124,237,98,0.64)" },
  bloodwave: { mode: "twin", core: "rgba(255,126,104,0.48)", hot: "rgba(255,235,225,0.72)", glow: "rgba(240,78,78,0.16)", fillBase: "rgba(210,38,54,0.12)", fillTip: "rgba(210,38,54,0.03)", dash: "rgba(255,160,140,0.62)", shadow: "rgba(0,0,0,0.2)", accent: "rgba(255,92,92,0.64)" },
  bladewave: { mode: "blade", core: "rgba(247,240,214,0.5)", hot: "rgba(255,255,255,0.74)", glow: "rgba(245,214,142,0.14)", fillBase: "rgba(247,240,214,0.11)", fillTip: "rgba(247,240,214,0.028)", dash: "rgba(255,247,223,0.62)", shadow: "rgba(0,0,0,0.2)", accent: "rgba(255,139,122,0.58)" },
  severwave: { mode: "blade", core: "rgba(255,139,122,0.5)", hot: "rgba(255,245,235,0.74)", glow: "rgba(255,91,91,0.15)", fillBase: "rgba(255,91,91,0.11)", fillTip: "rgba(255,91,91,0.028)", dash: "rgba(255,190,170,0.62)", shadow: "rgba(0,0,0,0.2)", accent: "rgba(255,126,104,0.62)" },
  sunderwave: { mode: "blade", core: "rgba(255,211,110,0.5)", hot: "rgba(255,255,235,0.74)", glow: "rgba(255,178,74,0.15)", fillBase: "rgba(255,178,74,0.11)", fillTip: "rgba(255,178,74,0.028)", dash: "rgba(255,223,122,0.62)", shadow: "rgba(0,0,0,0.2)", accent: "rgba(255,179,107,0.62)" },
  brutalwave: { mode: "blade", core: "rgba(255,126,104,0.52)", hot: "rgba(255,245,225,0.76)", glow: "rgba(255,118,64,0.16)", fillBase: "rgba(255,98,80,0.12)", fillTip: "rgba(255,98,80,0.03)", dash: "rgba(255,190,140,0.64)", shadow: "rgba(0,0,0,0.2)", accent: "rgba(255,179,107,0.66)" }
};
const VOID_HAZARD_PALETTE = { armed: "#b99cff", warn: "#7d6cff", fill: "rgba(142, 108, 255, 0.16)" };
const SPARK_HAZARD_PALETTE = { armed: "#f4d36b", warn: "#ffb36b", fill: "rgba(244, 211, 107, 0.16)" };
const SAP_HAZARD_PALETTE = { armed: "#a9d88f", warn: "#6fbf73", fill: "rgba(126, 203, 111, 0.16)" };
const DEFAULT_HAZARD_PALETTE = { armed: "#ffdf7a", warn: "#ff7e68", fill: "rgba(255, 91, 91, 0.14)" };
const TWIN_WAVE_DASH = [9, 7];
const CONE_WAVE_DASH = [10, 8];

function projectilePalette(effectKind: string) {
  return PLAYER_PROJECTILE_PALETTES[effectKind];
}

function linePalette(effectKind: string, fallback: string): LineVisual {
  return LINE_VISUALS[effectKind] ?? projectilePalette(effectKind) ?? {
    core: "#ffffff",
    glow: "rgba(255,255,255,0.16)",
    trail: fallback,
    ribbon: "rgba(255,255,255,0.1)",
    accent: "#ffffff",
    shadow: fallback
  };
}

function seedUnit(id: string, salt: number) {
  const source = id || "hazard";
  let hash = 2166136261;
  for (let i = 0; i < source.length; i += 1) hash = Math.imul(hash ^ source.charCodeAt(i), 16777619);
  hash = Math.imul(hash ^ salt, 16777619);
  return ((hash >>> 0) % 1000) / 1000;
}

function hazardArray() {
  return activeRenderPool ? activeRenderPool.array() : [];
}

function hazardCommands(): PathCommand[] {
  return (activeRenderPool ? activeRenderPool.commands() : []) as PathCommand[];
}

function hazardCommand(kind: string) {
  return (activeRenderPool?.command(kind) ?? { kind }) as Record<string, unknown>;
}

function pushMoveTo(commands: object[], x: number, y: number) {
  const command = hazardCommand("moveTo");
  command.x = x;
  command.y = y;
  commands.push(command as PathCommand);
}

function pushLineTo(commands: object[], x: number, y: number) {
  const command = hazardCommand("lineTo");
  command.x = x;
  command.y = y;
  commands.push(command as PathCommand);
}

function pushArc(commands: object[], x: number, y: number, radius: number, startAngle: number, endAngle: number) {
  const command = hazardCommand("arc");
  command.x = x;
  command.y = y;
  command.radius = radius;
  command.startAngle = startAngle;
  command.endAngle = endAngle;
  commands.push(command as PathCommand);
}

function pushClosePath(commands: object[]) {
  commands.push(hazardCommand("closePath"));
}

function groupRecord(hazard: HazardEntity, calls: Renderable[], alpha?: number) {
  const call = renderRecord(activeRenderPool, "group");
  call.id = hazard.id;
  call.x = hazard.x;
  call.y = hazard.y;
  call.ySort = hazard.y;
  call.alpha = alpha;
  call.calls = calls;
  return call as Renderable;
}

function group(hazard: HazardEntity, calls: Renderable[], alpha?: number): Renderable[] {
  const out = hazardArray();
  out.push(groupRecord(hazard, calls, alpha));
  return out;
}

function appendGroup(out: Renderable[], hazard: HazardEntity, calls: Renderable[], alpha?: number): Renderable[] {
  out.push(groupRecord(hazard, calls, alpha));
  return out;
}

function appendRendered(out: Renderable[], rendered: Renderable[]): Renderable[] {
  for (const call of rendered) out.push(call);
  return out;
}

function lineMetrics(hazard: HazardEntity) {
  const dx = hazard.toX - hazard.x;
  const dy = hazard.toY - hazard.y;
  const length = Math.hypot(dx, dy) || 1;
  lineMetricsScratch.dx = dx / length;
  lineMetricsScratch.dy = dy / length;
  lineMetricsScratch.px = -dy / length;
  lineMetricsScratch.py = dx / length;
  lineMetricsScratch.length = length;
  return lineMetricsScratch;
}

function addGlowCircle(calls: Renderable[], x: number, y: number, radius: number, fill: string, shadowColor: string, alpha = 1) {
  calls.push({ kind: "circle", x, y, radius, fill, alpha, shadowColor, shadowBlur: Math.max(8, radius * 0.18) });
}

function addRing(calls: Renderable[], x: number, y: number, radius: number, stroke: string, lineWidth: number, alpha: number, shadowColor?: string) {
  calls.push({ kind: "circle", x, y, radius, stroke, lineWidth, alpha, shadowColor, shadowBlur: shadowColor ? Math.max(5, lineWidth * 3) : undefined });
}

function addArrowHead(calls: Renderable[], x: number, y: number, dx: number, dy: number, width: number, fill: string, alpha = 1) {
  const px = -dy;
  const py = dx;
  calls.push({
    kind: "polygon",
    points: [
      { x, y },
      { x: x - dx * width - px * width * 0.5, y: y - dy * width - py * width * 0.5 },
      { x: x - dx * width * 0.45, y: y - dy * width * 0.45 },
      { x: x - dx * width + px * width * 0.5, y: y - dy * width + py * width * 0.5 }
    ],
    fill,
    alpha
  });
}

function scaleRgbaAlpha(color: string, scale: number) {
  return color.replace(/rgba\(([^,]+),([^,]+),([^,]+),([^)]+)\)/, (_match, r, g, b, alpha) => `rgba(${r},${g},${b},${clamp01(Number(alpha) * scale)})`);
}

function renderPlayerProjectile(hazard: HazardEntity): Renderable[] | undefined {
  const projectile = projectilePalette(hazard.effectKind);
  if (!projectile) return undefined;

  const dx = hazard.x - hazard.toX;
  const dy = hazard.y - hazard.toY;
  const length = Math.hypot(dx, dy);
  const dirX = length > 0 ? dx / length : hazard.aimX ?? 1;
  const dirY = length > 0 ? dy / length : hazard.aimY ?? 0;
  const sideX = -dirY;
  const sideY = dirX;
  const trail = Math.max(12, Math.min(46, length || hazard.radius * 3));
  const tailX = hazard.x - dirX * trail;
  const tailY = hazard.y - dirY * trail;
  const lineWidth = hazard.effectKind === "razor" ? Math.max(6, Math.min(18, hazard.radius * 0.22)) : Math.max(2, Math.min(8, hazard.radius * 0.65));
  const tailWidth = hazard.effectKind === "razor" ? lineWidth : lineWidth * 0.5;
  const headRadius = hazard.effectKind === "noxious-flask" ? 5.5 : Math.max(2.8, Math.min(8.5, hazard.radius * 0.52));
  const calls = hazardArray();

  calls.push(
    { kind: "line", x1: tailX, y1: tailY, x2: hazard.x, y2: hazard.y, stroke: projectile.glow, lineWidth: tailWidth * 4.2, cap: "round", shadowColor: projectile.shadow, shadowBlur: 14 },
    {
      kind: "polygon",
      points: [
        { x: tailX + sideX * tailWidth * 1.5, y: tailY + sideY * tailWidth * 1.5 },
        { x: tailX - sideX * tailWidth * 1.5, y: tailY - sideY * tailWidth * 1.5 },
        { x: hazard.x - sideX * tailWidth * 0.5, y: hazard.y - sideY * tailWidth * 0.5 },
        { x: hazard.x + sideX * tailWidth * 0.5, y: hazard.y + sideY * tailWidth * 0.5 }
      ],
      fill: projectile.ribbon
    },
    { kind: "line", x1: tailX, y1: tailY, x2: hazard.x, y2: hazard.y, stroke: projectile.trail, lineWidth: tailWidth * 1.25, cap: "round" },
    { kind: "line", x1: hazard.x - dirX * trail * 0.44, y1: hazard.y - dirY * trail * 0.44, x2: hazard.x, y2: hazard.y, stroke: projectile.core, lineWidth: Math.max(1, tailWidth * 0.45), cap: "round" }
  );
  addGlowCircle(calls, hazard.x, hazard.y, Math.max(8, hazard.radius * 1.35), projectile.glow, projectile.shadow, 0.9);
  calls.push({ kind: "circle", x: hazard.x, y: hazard.y, radius: headRadius, fill: projectile.core, shadowColor: projectile.shadow, shadowBlur: 8 });

  for (let i = 0; i < 3; i += 1) {
    const t = 0.18 + i * 0.24;
    const spread = (seedUnit(hazard.id, i) - 0.5) * tailWidth * 2.8;
    calls.push({ kind: "circle", x: hazard.x - dirX * trail * t + sideX * spread, y: hazard.y - dirY * trail * t + sideY * spread, radius: 1.2 + i * 0.35, fill: projectile.accent, alpha: 0.42 - i * 0.08 });
  }

  if (hazard.effectKind === "razor") {
    const angle = Math.atan2(dirY, dirX);
    calls.push({
      kind: "path",
      commands: [{ kind: "arc", x: hazard.x, y: hazard.y, radius: Math.max(18, hazard.radius * 0.62), startAngle: angle - 1.1, endAngle: angle + 1.1 }],
      stroke: projectile.core,
      lineWidth: 2.4,
      cap: "round",
      shadowColor: projectile.shadow,
      shadowBlur: 8
    });
  }

  return group(hazard, calls);
}

function renderProjectileTrace(hazard: HazardEntity, timing: HazardTimingState): Renderable[] | undefined {
  if (hazard.kind !== "line") return undefined;
  const projectile = projectilePalette(hazard.effectKind);
  if (!projectile) return undefined;

  const m = lineMetrics(hazard);
  if (m.length < 4) return undefined;
  const headT = clamp01(0.04 + timing.lifeT * 1.26);
  const tailSpan = Math.min(0.34, Math.max(0.1, 46 / m.length));
  const tailT = Math.max(0, headT - tailSpan);
  const headX = hazard.x + (hazard.toX - hazard.x) * headT;
  const headY = hazard.y + (hazard.toY - hazard.y) * headT;
  const tailX = hazard.x + (hazard.toX - hazard.x) * tailT;
  const tailY = hazard.y + (hazard.toY - hazard.y) * tailT;
  const fade = clamp01(1 - Math.max(0, timing.lifeT - 0.7) / 0.3);
  const alpha = fade * clamp01(headT / 0.18);
  if (alpha <= 0.02) return hazardArray();

  const lineWidth = Math.max(2, Math.min(8, hazard.radius * 0.62));
  const tailWidth = lineWidth * 0.5;
  const calls = hazardArray();
  calls.push(
    { kind: "line", x1: tailX, y1: tailY, x2: headX, y2: headY, stroke: projectile.glow, lineWidth: tailWidth * 4.2, cap: "round", alpha: 0.8 * alpha, shadowColor: projectile.shadow, shadowBlur: 14 },
    { kind: "line", x1: tailX, y1: tailY, x2: headX, y2: headY, stroke: projectile.ribbon, lineWidth: tailWidth * 2.2, cap: "round", alpha: 0.9 * alpha },
    { kind: "line", x1: tailX, y1: tailY, x2: headX, y2: headY, stroke: projectile.trail, lineWidth: tailWidth, cap: "round", alpha },
    { kind: "line", x1: tailX + (headX - tailX) * 0.54, y1: tailY + (headY - tailY) * 0.54, x2: headX, y2: headY, stroke: projectile.core, lineWidth: Math.max(1, tailWidth * 0.38), cap: "round", alpha }
  );
  addGlowCircle(calls, headX, headY, Math.max(7, hazard.radius * 1.15), projectile.glow, projectile.shadow, 0.84 * alpha);
  calls.push({ kind: "circle", x: headX, y: headY, radius: Math.max(2.5, Math.min(7, hazard.radius * 0.48)), fill: projectile.core, alpha, shadowColor: projectile.shadow, shadowBlur: 8 });
  for (let i = 0; i < 3; i += 1) {
    const t = Math.max(0, headT - tailSpan * (0.28 + i * 0.22));
    const spread = (seedUnit(hazard.id, i) - 0.5) * tailWidth * 2.4;
    calls.push({
      kind: "circle",
      x: hazard.x + (hazard.toX - hazard.x) * t + m.px * spread,
      y: hazard.y + (hazard.toY - hazard.y) * t + m.py * spread,
      radius: 1.2 + i * 0.32,
      fill: projectile.accent,
      alpha: (0.42 - i * 0.08) * alpha
    });
  }

  return group(hazard, calls, alpha);
}

function meleeWaveVisual(effectKind: string) {
  return MELEE_WAVE_VISUALS[effectKind];
}

function coneCommands(hazard: HazardEntity, angle: number, half: number, radius: number) {
  const left = angle - half;
  const right = angle + half;
  const commands = hazardCommands();
  pushMoveTo(commands, hazard.x, hazard.y);
  pushLineTo(commands, hazard.x + Math.cos(left) * radius, hazard.y + Math.sin(left) * radius);
  pushArc(commands, hazard.x, hazard.y, radius, left, right);
  pushLineTo(commands, hazard.x, hazard.y);
  pushClosePath(commands);
  return commands;
}

function addMeleeCenterLine(calls: Renderable[], hazard: HazardEntity, angle: number, radius: number, visual: MeleeWaveVisual, alpha: number) {
  const start = Math.max(14, Math.min(24, radius * 0.12));
  calls.push({
    kind: "line",
    x1: hazard.x + Math.cos(angle) * start,
    y1: hazard.y + Math.sin(angle) * start,
    x2: hazard.x + Math.cos(angle) * radius,
    y2: hazard.y + Math.sin(angle) * radius,
    stroke: visual.hot,
    lineWidth: 1.15,
    cap: "round",
    alpha
  });
}

function addBladeChevrons(calls: Renderable[], hazard: HazardEntity, angle: number, radius: number, visual: MeleeWaveVisual, alpha: number) {
  const dirX = Math.cos(angle);
  const dirY = Math.sin(angle);
  const sideX = -dirY;
  const sideY = dirX;
  for (let i = 0; i < 3; i += 1) {
    const center = radius * (0.42 + i * 0.18);
    const spread = 7 + i * 1.8;
    const pull = 13 + i * 2;
    const x = hazard.x + dirX * center;
    const y = hazard.y + dirY * center;
    calls.push(
      { kind: "line", x1: x + sideX * spread, y1: y + sideY * spread, x2: x + dirX * pull, y2: y + dirY * pull, stroke: visual.accent, lineWidth: 1.25, cap: "round", alpha },
      { kind: "line", x1: x - sideX * spread, y1: y - sideY * spread, x2: x + dirX * pull, y2: y + dirY * pull, stroke: visual.accent, lineWidth: 1.25, cap: "round", alpha }
    );
  }
}

function renderTwinMeleeWave(hazard: HazardEntity, timing: HazardTimingState, visual: MeleeWaveVisual): Renderable[] {
  const m = lineMetrics(hazard);
  const fade = clamp01(1 - timing.lifeT * 1.25);
  if (fade <= 0) return hazardArray();
  const progress = 0.45 + (1 - Math.pow(1 - timing.lifeT, 2)) * 0.55;
  const range = hazard.radius * progress;
  const start = 12;
  const baseGap = Math.max(8, Math.min(17, hazard.radius * 0.075));
  const tipGap = baseGap * 0.36;
  const dashOffset = -timing.lifeT * 56;
  const calls = hazardArray();
  const tipX = hazard.x + m.dx * range;
  const tipY = hazard.y + m.dy * range;

  calls.push({
    kind: "polygon",
    points: [
      { x: hazard.x + m.dx * start + m.px * (baseGap + 6), y: hazard.y + m.dy * start + m.py * (baseGap + 6) },
      { x: hazard.x + m.dx * start - m.px * (baseGap + 6), y: hazard.y + m.dy * start - m.py * (baseGap + 6) },
      { x: tipX - m.px * (tipGap + 5), y: tipY - m.py * (tipGap + 5) },
      { x: tipX + m.px * (tipGap + 5), y: tipY + m.py * (tipGap + 5) }
    ],
    fill: { kind: "linear-gradient", x0: hazard.x, y0: hazard.y, x1: tipX, y1: tipY, stops: [[0, visual.fillBase], [1, visual.fillTip]] },
    alpha: fade
  });

  for (const side of [-1, 1]) {
    const x1 = hazard.x + m.dx * start + m.px * baseGap * side;
    const y1 = hazard.y + m.dy * start + m.py * baseGap * side;
    const x2 = tipX + m.px * tipGap * side;
    const y2 = tipY + m.py * tipGap * side;
    calls.push(
      { kind: "line", x1, y1, x2, y2, stroke: visual.shadow, lineWidth: 5.6, cap: "round", alpha: 0.6 * fade },
      { kind: "line", x1, y1, x2, y2, stroke: visual.glow, lineWidth: 4.2, cap: "round", alpha: fade, shadowColor: visual.glow, shadowBlur: 7 },
      { kind: "line", x1, y1, x2, y2, stroke: visual.core, lineWidth: 1.7, cap: "round", alpha: fade },
      { kind: "line", x1, y1, x2, y2, stroke: visual.dash, lineWidth: 1, cap: "round", lineDash: TWIN_WAVE_DASH, lineDashOffset: dashOffset, alpha: 0.85 * fade }
    );
  }
  addMeleeCenterLine(calls, hazard, Math.atan2(m.dy, m.dx), range, visual, 0.46 * fade);
  return group(hazard, calls, fade);
}

function renderConeOrBladeMeleeWave(hazard: HazardEntity, timing: HazardTimingState, visual: MeleeWaveVisual): Renderable[] {
  const angle = Math.atan2(hazard.toY - hazard.y, hazard.toX - hazard.x);
  const half = ((hazard.pulse || 60) * Math.PI) / 180;
  const ageT = clamp01(timing.lifeT);
  const fade = clamp01(1 - ageT * 1.18);
  if (fade <= 0) return hazardArray();
  const progress = 0.36 + (1 - Math.pow(1 - ageT, 1.6)) * 0.64;
  const radius = hazard.radius * progress;
  const outer = hazard.radius * (0.72 + progress * 0.18);
  const dashOffset = -ageT * 64;
  const tipX = hazard.x + Math.cos(angle) * outer;
  const tipY = hazard.y + Math.sin(angle) * outer;
  const commands = coneCommands(hazard, angle, half, outer);
  const fillBase = scaleRgbaAlpha(visual.fillBase, 1.1);
  const fillTip = scaleRgbaAlpha(visual.fillTip, 1.1);
  const calls = hazardArray();
  const outerArc = hazardCommands();
  pushArc(outerArc, hazard.x, hazard.y, outer, angle - half, angle + half);
  const innerArc = hazardCommands();
  pushArc(innerArc, hazard.x, hazard.y, radius, angle - half * 0.82, angle + half * 0.82);
  calls.push(
    { kind: "path", commands, stroke: visual.shadow, lineWidth: 2.6, fill: "rgba(0,0,0,0.035)", alpha: fade },
    {
      kind: "path",
      commands,
      fill: { kind: "linear-gradient", x0: hazard.x, y0: hazard.y, x1: tipX, y1: tipY, stops: [[0, fillBase], [1, fillTip]] },
      stroke: visual.glow,
      lineWidth: 1,
      alpha: fade
    },
    {
      kind: "path",
      commands: outerArc,
      stroke: visual.dash,
      lineWidth: 1.25,
      cap: "round",
      lineDash: CONE_WAVE_DASH,
      lineDashOffset: dashOffset,
      alpha: 0.8 * fade,
      shadowColor: visual.glow,
      shadowBlur: 5
    },
    {
      kind: "path",
      commands: innerArc,
      stroke: visual.core,
      lineWidth: visual.mode === "blade" ? 1.7 : 1.45,
      cap: "round",
      alpha: 0.76 * fade
    }
  );
  addMeleeCenterLine(calls, hazard, angle, outer, visual, 0.52 * fade);
  if (visual.mode === "blade") addBladeChevrons(calls, hazard, angle, outer, visual, 0.72 * fade);
  return group(hazard, calls, fade);
}

function renderMeleeWaveHazard(hazard: HazardEntity, timing: HazardTimingState): Renderable[] | undefined {
  if (hazard.kind !== "line") return undefined;
  const visual = meleeWaveVisual(hazard.effectKind);
  if (!visual) return undefined;
  if (timing.lifeT >= 1) return hazardArray();
  return visual.mode === "twin" ? renderTwinMeleeWave(hazard, timing, visual) : renderConeOrBladeMeleeWave(hazard, timing, visual);
}

function renderIceWallHazard(hazard: HazardEntity, timing: HazardTimingState): Renderable[] {
  const calls = hazardArray();
  const visual = LINE_VISUALS.icewall;
  const m = lineMetrics(hazard);
  const lifeFade = clamp01(1 - timing.lifeT * 1.2);
  const wallWidth = Math.max(18, hazard.radius * (0.8 + timing.warning * 0.2));
  calls.push(
    { kind: "line", x1: hazard.x, y1: hazard.y, x2: hazard.toX, y2: hazard.toY, stroke: visual.glow, lineWidth: wallWidth * 1.8, cap: "round", alpha: 0.34 * lifeFade, shadowColor: visual.shadow, shadowBlur: 18 },
    { kind: "line", x1: hazard.x, y1: hazard.y, x2: hazard.toX, y2: hazard.toY, stroke: visual.ribbon, lineWidth: wallWidth, cap: "round", alpha: 0.9 * lifeFade },
    { kind: "line", x1: hazard.x, y1: hazard.y, x2: hazard.toX, y2: hazard.toY, stroke: visual.core, lineWidth: Math.max(3, wallWidth * 0.22), cap: "round", alpha: lifeFade, shadowColor: visual.shadow, shadowBlur: 10 }
  );

  const shards = Math.max(5, Math.min(10, Math.floor(m.length / 36)));
  for (let i = 0; i <= shards; i += 1) {
    const t = i / Math.max(1, shards);
    const x = hazard.x + (hazard.toX - hazard.x) * t;
    const y = hazard.y + (hazard.toY - hazard.y) * t;
    const size = 5 + seedUnit(hazard.id, i) * 6;
    calls.push({
      kind: "polygon",
      points: [
        { x: x + m.px * size * 1.2, y: y + m.py * size * 1.2 },
        { x: x + m.dx * size * 0.7, y: y + m.dy * size * 0.7 },
        { x: x - m.px * size * 1.2, y: y - m.py * size * 1.2 },
        { x: x - m.dx * size * 0.7, y: y - m.dy * size * 0.7 }
      ],
      fill: "rgba(226,251,255,0.34)",
      stroke: "rgba(255,255,255,0.72)",
      lineWidth: 1,
      alpha: lifeFade
    });
  }
  return group(hazard, calls, lifeFade);
}

function renderLineHazard(hazard: HazardEntity, timing: HazardTimingState, fallbackStroke: string, alpha: number): Renderable[] {
  if (hazard.effectKind === "icewall") return renderIceWallHazard(hazard, timing);

  const calls = hazardArray();
  const visual = linePalette(hazard.effectKind, fallbackStroke);
  const m = lineMetrics(hazard);
  const projectileAlpha = ["arrow", "root", "piercearrow"].includes(hazard.effectKind) && timing.armed ? clamp01((1 - timing.lifeT) / 0.25) : 1;
  const warningLineWidth = Math.max(1.1, hazard.radius * 0.48 * (1 - timing.warning) + 1.1 * timing.warning);
  const warningAlpha = Math.min(0.42, alpha * 0.82) * (1 - timing.warning * 0.4);
  const impactWidth = Math.max(1.2, hazard.radius * (timing.armed ? 0.34 : 0.58));
  const coreAlpha = projectileAlpha * (timing.armed ? 0.86 : 0.34 + timing.warning * 0.32);

  calls.push(
    { kind: "line", x1: hazard.x, y1: hazard.y, x2: hazard.toX, y2: hazard.toY, stroke: visual.glow, lineWidth: Math.max(5, warningLineWidth * 3.8), cap: "round", alpha: warningAlpha * projectileAlpha, shadowColor: visual.shadow, shadowBlur: 12 },
    { kind: "line", x1: hazard.x, y1: hazard.y, x2: hazard.toX, y2: hazard.toY, stroke: visual.ribbon, lineWidth: Math.max(2.5, impactWidth * 2.2), cap: "round", alpha: coreAlpha * 0.8 },
    { kind: "line", x1: hazard.x, y1: hazard.y, x2: hazard.toX, y2: hazard.toY, stroke: visual.trail, lineWidth: Math.max(1.5, impactWidth), cap: "round", alpha: coreAlpha },
    { kind: "line", x1: hazard.x, y1: hazard.y, x2: hazard.toX, y2: hazard.toY, stroke: visual.core, lineWidth: 1, cap: "round", alpha: projectileAlpha * (0.22 + timing.warning * 0.5) }
  );

  const markers = Math.max(3, Math.min(12, Math.floor(m.length / 44)));
  for (let i = 1; i < markers; i += 1) {
    const t = i / markers;
    const x = hazard.x + (hazard.toX - hazard.x) * t;
    const y = hazard.y + (hazard.toY - hazard.y) * t;
    const size = ["arrow", "piercearrow"].includes(hazard.effectKind) ? 4 : 2.6;
    calls.push({ kind: "circle", x, y, radius: size, fill: visual.accent, alpha: projectileAlpha * (timing.armed ? 0.2 : 0.22 + timing.warning * 0.34) });
  }

  if (hazard.effectKind === "arrow" || hazard.effectKind === "piercearrow") {
    addArrowHead(calls, hazard.toX, hazard.toY, m.dx, m.dy, hazard.effectKind === "piercearrow" ? 18 : 14, visual.core, projectileAlpha * (timing.armed ? 0.86 : 0.58));
  }
  if (hazard.effectKind === "root") {
    for (let i = 1; i < 5; i += 1) {
      const t = i / 5;
      const x = hazard.x + (hazard.toX - hazard.x) * t;
      const y = hazard.y + (hazard.toY - hazard.y) * t;
      calls.push({ kind: "line", x1: x - m.px * 8, y1: y - m.py * 8, x2: x + m.px * 8, y2: y + m.py * 8, stroke: visual.accent, lineWidth: 1.3, cap: "round", alpha: 0.46 * projectileAlpha });
    }
  }

  return group(hazard, calls);
}

function renderMeteor(hazard: HazardEntity, timing: HazardTimingState): Renderable[] {
  const calls = hazardArray();
  const eased = 1 - Math.pow(1 - timing.warning, 3);
  const lifeFade = clamp01(1 - timing.lifeT * 1.15);
  const radius = hazard.radius * (timing.armed ? 0.82 + timing.lifeT * 0.35 : 0.34 + eased * 0.66);

  if (!timing.armed) {
    addGlowCircle(calls, hazard.x, hazard.y, radius, "rgba(255, 91, 64, 0.11)", "rgba(255, 120, 78, 0.64)", 0.8);
    addRing(calls, hazard.x, hazard.y, radius, "#ffb36b", 2.2, 0.36 + eased * 0.34, "rgba(255, 160, 82, 0.65)");
    addRing(calls, hazard.x, hazard.y, hazard.radius * (0.16 + eased * 0.38), "rgba(255,255,255,0.72)", 1.2, 0.48);
    const fallX = hazard.x - 90 * (1 - eased);
    const fallY = hazard.y - 170 * (1 - eased);
    calls.push({ kind: "line", x1: fallX - 44, y1: fallY - 84, x2: hazard.x, y2: hazard.y, stroke: "rgba(255,190,96,0.58)", lineWidth: 2.8, cap: "round", shadowColor: "rgba(255,150,84,0.74)", shadowBlur: 14 });
    calls.push({ kind: "circle", x: fallX, y: fallY, radius: 9 + eased * 4, fill: "#fff3b8", shadowColor: "rgba(255,150,84,0.84)", shadowBlur: 18 });
  } else {
    addGlowCircle(calls, hazard.x, hazard.y, radius, "rgba(255, 91, 64, 0.16)", "rgba(255, 120, 78, 0.74)", lifeFade);
    addRing(calls, hazard.x, hazard.y, radius, "#ffdf7a", 2.6, lifeFade, "rgba(255,190,96,0.7)");
    addRing(calls, hazard.x, hazard.y, hazard.radius * (0.24 + timing.lifeT * 0.56), "rgba(255,255,255,0.62)", 1.3, lifeFade * 0.8);
    calls.push({ kind: "circle", x: hazard.x, y: hazard.y, radius: hazard.radius * 0.18, fill: "rgba(255,220,120,0.28)", alpha: lifeFade, shadowColor: "rgba(255,178,74,0.7)", shadowBlur: 12 });
    for (let i = 0; i < 12; i += 1) {
      const a = (Math.PI * 2 * i) / 12;
      const inner = hazard.radius * (0.22 + timing.lifeT * 0.08);
      const outer = hazard.radius * (0.62 + seedUnit(hazard.id, i) * 0.24);
      calls.push({ kind: "line", x1: hazard.x + Math.cos(a) * inner, y1: hazard.y + Math.sin(a) * inner, x2: hazard.x + Math.cos(a) * outer, y2: hazard.y + Math.sin(a) * outer, stroke: "rgba(255,205,108,0.42)", lineWidth: 1.4, cap: "round", alpha: lifeFade });
    }
  }
  return group(hazard, calls, lifeFade);
}

function renderMeteorBurn(hazard: HazardEntity, timing: HazardTimingState): Renderable[] {
  const calls = hazardArray();
  const lifeFade = clamp01(1 - timing.lifeT * 1.05);
  const radius = hazard.radius * (0.78 + timing.warning * 0.22);
  calls.push(
    { kind: "circle", x: hazard.x, y: hazard.y, radius, fill: "rgba(92,45,30,0.18)", stroke: "rgba(255,142,72,0.44)", lineWidth: 1.8, alpha: lifeFade, shadowColor: "rgba(255,118,64,0.52)", shadowBlur: 10 },
    { kind: "circle", x: hazard.x, y: hazard.y, radius: hazard.radius * 0.42, fill: "rgba(255,126,64,0.12)", stroke: "rgba(255,223,122,0.3)", lineWidth: 1.2, alpha: lifeFade }
  );
  for (let i = 0; i < 10; i += 1) {
    const a = seedUnit(hazard.id, i) * Math.PI * 2;
    const d = hazard.radius * (0.18 + seedUnit(hazard.id, i + 10) * 0.68);
    calls.push({ kind: "circle", x: hazard.x + Math.cos(a) * d, y: hazard.y + Math.sin(a) * d, radius: 1.8 + seedUnit(hazard.id, i + 20) * 2.4, fill: "rgba(255,196,92,0.62)", alpha: lifeFade });
  }
  return group(hazard, calls, lifeFade);
}

function renderGravity(hazard: HazardEntity, timing: HazardTimingState): Renderable[] {
  const calls = hazardArray();
  const lifeFade = clamp01(1 - timing.lifeT * 0.8);
  const phase = timing.lifeT * Math.PI * 2;
  const radius = hazard.radius * (0.72 + timing.warning * 0.28);
  addGlowCircle(calls, hazard.x, hazard.y, radius, "rgba(68, 48, 138, 0.16)", "rgba(154,128,255,0.62)", lifeFade);
  addRing(calls, hazard.x, hazard.y, radius, "#b99cff", 2, 0.62 * lifeFade, "rgba(154,128,255,0.62)");
  for (let i = 0; i < 5; i += 1) {
    const r = hazard.radius * (0.2 + i * 0.14);
    calls.push({ kind: "path", commands: [{ kind: "arc", x: hazard.x, y: hazard.y, radius: r, startAngle: phase + i * 0.7, endAngle: phase + i * 0.7 + Math.PI * 1.35 }], stroke: `rgba(210,190,255,${0.28 * lifeFade})`, lineWidth: 1.5 + i * 0.2, cap: "round", shadowColor: "rgba(154,128,255,0.52)", shadowBlur: 8 });
  }
  for (let i = 0; i < 9; i += 1) {
    const a = phase * 0.4 + (Math.PI * 2 * i) / 9;
    const outer = radius * 0.92;
    const inner = hazard.radius * 0.18;
    calls.push({ kind: "line", x1: hazard.x + Math.cos(a) * outer, y1: hazard.y + Math.sin(a) * outer, x2: hazard.x + Math.cos(a + 0.45) * inner, y2: hazard.y + Math.sin(a + 0.45) * inner, stroke: "rgba(185,156,255,0.38)", lineWidth: 1.2, cap: "round", alpha: lifeFade });
  }
  calls.push({ kind: "circle", x: hazard.x, y: hazard.y, radius: Math.max(8, hazard.radius * 0.08), fill: "rgba(238,230,255,0.34)", shadowColor: "rgba(185,156,255,0.7)", shadowBlur: 12, alpha: lifeFade });
  return group(hazard, calls, lifeFade);
}

function renderConsecrate(hazard: HazardEntity, timing: HazardTimingState): Renderable[] {
  const calls = hazardArray();
  const lifeFade = clamp01(1 - timing.lifeT * 0.85);
  const radius = hazard.radius * (0.7 + timing.warning * 0.3);
  addGlowCircle(calls, hazard.x, hazard.y, radius, "rgba(244,211,107,0.13)", "rgba(255,224,128,0.58)", lifeFade);
  addRing(calls, hazard.x, hazard.y, radius, "#f4d36b", 2.2, 0.72 * lifeFade, "rgba(255,224,128,0.58)");
  addRing(calls, hazard.x, hazard.y, hazard.radius * 0.44, "rgba(176,255,206,0.52)", 1.4, lifeFade);
  calls.push({
    kind: "polygon",
    points: [
      { x: hazard.x, y: hazard.y - hazard.radius * 0.52 },
      { x: hazard.x + hazard.radius * 0.52, y: hazard.y },
      { x: hazard.x, y: hazard.y + hazard.radius * 0.52 },
      { x: hazard.x - hazard.radius * 0.52, y: hazard.y }
    ],
    stroke: "rgba(255,243,184,0.58)",
    lineWidth: 1.4,
    alpha: lifeFade
  });
  calls.push(
    { kind: "line", x1: hazard.x - hazard.radius * 0.28, y1: hazard.y, x2: hazard.x + hazard.radius * 0.28, y2: hazard.y, stroke: "rgba(255,255,255,0.58)", lineWidth: 2, cap: "round", alpha: lifeFade },
    { kind: "line", x1: hazard.x, y1: hazard.y - hazard.radius * 0.28, x2: hazard.x, y2: hazard.y + hazard.radius * 0.28, stroke: "rgba(255,255,255,0.58)", lineWidth: 2, cap: "round", alpha: lifeFade }
  );
  for (let i = 0; i < 8; i += 1) {
    const a = (Math.PI * 2 * i) / 8;
    calls.push({ kind: "circle", x: hazard.x + Math.cos(a) * hazard.radius * 0.68, y: hazard.y + Math.sin(a) * hazard.radius * 0.68, radius: 3.6, fill: i % 2 ? "#f4d36b" : "#9ff2c0", alpha: 0.62 * lifeFade });
  }
  return group(hazard, calls, lifeFade);
}

function renderNoxious(hazard: HazardEntity, timing: HazardTimingState): Renderable[] {
  const calls = hazardArray();
  const lifeFade = clamp01(1 - timing.lifeT * 0.9);
  const radius = hazard.radius * (0.74 + timing.warning * 0.26);
  addGlowCircle(calls, hazard.x, hazard.y, radius, "rgba(84,180,62,0.13)", "rgba(134,255,96,0.46)", lifeFade);
  addRing(calls, hazard.x, hazard.y, radius, "#7ced62", 1.8, 0.54 * lifeFade, "rgba(134,255,96,0.46)");
  for (let i = 0; i < 11; i += 1) {
    const a = seedUnit(hazard.id, i) * Math.PI * 2;
    const d = hazard.radius * (0.08 + seedUnit(hazard.id, i + 12) * 0.78);
    const r = hazard.radius * (0.05 + seedUnit(hazard.id, i + 24) * 0.11);
    calls.push({ kind: "circle", x: hazard.x + Math.cos(a) * d, y: hazard.y + Math.sin(a) * d, radius: r, fill: i % 3 ? "rgba(112,214,72,0.2)" : "rgba(216,255,154,0.16)", stroke: "rgba(180,255,120,0.24)", lineWidth: 1, alpha: lifeFade });
  }
  for (let i = 0; i < 6; i += 1) {
    const a = (Math.PI * 2 * i) / 6 + timing.lifeT;
    const d = hazard.radius * (0.3 + (i % 2) * 0.28);
    calls.push({ kind: "circle", x: hazard.x + Math.cos(a) * d, y: hazard.y + Math.sin(a) * d, radius: 2.5 + i % 3, stroke: "rgba(216,255,154,0.58)", lineWidth: 1, alpha: lifeFade });
  }
  return group(hazard, calls, lifeFade);
}

function renderArrowStorm(hazard: HazardEntity, timing: HazardTimingState): Renderable[] {
  const calls = hazardArray();
  const lifeFade = clamp01(1 - timing.lifeT * 0.88);
  const radius = hazard.radius * (0.72 + timing.warning * 0.28);
  calls.push({ kind: "circle", x: hazard.x, y: hazard.y, radius, fill: "rgba(118,96,58,0.1)", stroke: "rgba(244,211,107,0.42)", lineWidth: 2, alpha: lifeFade, shadowColor: "rgba(244,211,107,0.46)", shadowBlur: 8 });
  for (let i = 0; i < 12; i += 1) {
    const a = seedUnit(hazard.id, i) * Math.PI * 2;
    const d = Math.sqrt(seedUnit(hazard.id, i + 20)) * hazard.radius * 0.78;
    const x = hazard.x + Math.cos(a) * d;
    const y = hazard.y + Math.sin(a) * d;
    const fall = 34 + seedUnit(hazard.id, i + 40) * 34;
    const x1 = x - fall * 0.38;
    const y1 = y - fall;
    calls.push({ kind: "line", x1, y1, x2: x, y2: y, stroke: "rgba(255,243,184,0.6)", lineWidth: 1.4, cap: "round", alpha: lifeFade, shadowColor: "rgba(244,211,107,0.46)", shadowBlur: 6 });
    addArrowHead(calls, x, y, 0.36, 0.93, 8, "#fff3b8", 0.5 * lifeFade);
  }
  return group(hazard, calls, lifeFade);
}

function renderSmoke(hazard: HazardEntity, timing: HazardTimingState): Renderable[] {
  const calls = hazardArray();
  const lifeFade = clamp01(1 - timing.lifeT * 0.75);
  const radius = hazard.radius * (0.76 + timing.warning * 0.24);
  calls.push({ kind: "circle", x: hazard.x, y: hazard.y, radius, fill: "rgba(58,62,64,0.2)", stroke: "rgba(198,210,205,0.28)", lineWidth: 1.6, alpha: lifeFade, shadowColor: "rgba(160,170,165,0.28)", shadowBlur: 10 });
  for (let i = 0; i < 9; i += 1) {
    const a = (Math.PI * 2 * i) / 9 + timing.lifeT * 0.9;
    const d = hazard.radius * (0.16 + seedUnit(hazard.id, i) * 0.5);
    calls.push({ kind: "ellipse", x: hazard.x + Math.cos(a) * d, y: hazard.y + Math.sin(a) * d * 0.82, radiusX: hazard.radius * (0.12 + seedUnit(hazard.id, i + 12) * 0.1), radiusY: hazard.radius * (0.08 + seedUnit(hazard.id, i + 24) * 0.09), rotation: a, fill: "rgba(210,220,214,0.14)", stroke: "rgba(220,230,224,0.18)", lineWidth: 1, alpha: lifeFade });
  }
  return group(hazard, calls, lifeFade);
}

function renderMaelstrom(hazard: HazardEntity, timing: HazardTimingState): Renderable[] {
  const calls = hazardArray();
  const lifeFade = clamp01(1 - timing.lifeT * 1.05);
  const phase = timing.lifeT * Math.PI * 2;
  const radius = hazard.radius * (0.68 + timing.warning * 0.32);
  addGlowCircle(calls, hazard.x, hazard.y, radius, "rgba(54,142,190,0.13)", "rgba(110,210,255,0.58)", lifeFade);
  addRing(calls, hazard.x, hazard.y, radius, "#8be7ff", 2, 0.58 * lifeFade, "rgba(110,210,255,0.58)");
  for (let i = 0; i < 5; i += 1) {
    const r = hazard.radius * (0.25 + i * 0.13);
    calls.push({ kind: "path", commands: [{ kind: "arc", x: hazard.x, y: hazard.y, radius: r, startAngle: phase + i * 0.86, endAngle: phase + i * 0.86 + Math.PI * 1.1 }], stroke: `rgba(190,244,255,${0.34 * lifeFade})`, lineWidth: 1.6 + i * 0.25, cap: "round", shadowColor: "rgba(110,210,255,0.48)", shadowBlur: 8 });
  }
  for (let i = 0; i < 4; i += 1) {
    const a = phase + (Math.PI * 2 * i) / 4;
    const x = hazard.x + Math.cos(a) * hazard.radius * 0.28;
    const y = hazard.y + Math.sin(a) * hazard.radius * 0.28;
    calls.push({
      kind: "polyline",
      points: [
        { x, y },
        { x: x + Math.cos(a + 0.7) * hazard.radius * 0.16, y: y + Math.sin(a + 0.7) * hazard.radius * 0.16 },
        { x: x + Math.cos(a) * hazard.radius * 0.38, y: y + Math.sin(a) * hazard.radius * 0.38 }
      ],
      stroke: "rgba(255,255,255,0.52)",
      lineWidth: 1.3,
      cap: "round",
      join: "round",
      alpha: lifeFade
    });
  }
  return group(hazard, calls, lifeFade);
}

function renderBubble(hazard: HazardEntity, timing: HazardTimingState): Renderable[] {
  const calls = hazardArray();
  const lifeFade = clamp01(1 - timing.lifeT * 1.15);
  const radius = hazard.radius * (0.72 + timing.warning * 0.28);
  addGlowCircle(calls, hazard.x, hazard.y, radius, "rgba(142,108,255,0.1)", "rgba(168,136,255,0.54)", lifeFade);
  addRing(calls, hazard.x, hazard.y, radius, "#b99cff", 2.2, 0.66 * lifeFade, "rgba(168,136,255,0.54)");
  addRing(calls, hazard.x, hazard.y, hazard.radius * 0.62, "rgba(225,245,255,0.36)", 1.1, lifeFade);
  calls.push(
    { kind: "path", commands: [{ kind: "arc", x: hazard.x, y: hazard.y, radius: radius * 0.72, startAngle: Math.PI * 1.08, endAngle: Math.PI * 1.62 }], stroke: "rgba(255,255,255,0.62)", lineWidth: 2, cap: "round", alpha: lifeFade },
    { kind: "circle", x: hazard.x - radius * 0.22, y: hazard.y - radius * 0.24, radius: Math.max(5, radius * 0.08), fill: "rgba(255,255,255,0.22)", alpha: lifeFade }
  );
  return group(hazard, calls, lifeFade);
}

function renderWhirlwind(hazard: HazardEntity, timing: HazardTimingState): Renderable[] {
  const calls = hazardArray();
  const lifeFade = clamp01(1 - timing.lifeT * 1.2);
  const phase = timing.lifeT * Math.PI * 2;
  const radius = hazard.radius * (0.72 + timing.warning * 0.28);
  addGlowCircle(calls, hazard.x, hazard.y, radius, "rgba(214,186,112,0.1)", "rgba(244,211,107,0.44)", lifeFade);
  for (let i = 0; i < 5; i += 1) {
    const r = hazard.radius * (0.32 + i * 0.12);
    const start = phase + i * 1.1;
    calls.push({ kind: "path", commands: [{ kind: "arc", x: hazard.x, y: hazard.y, radius: r, startAngle: start, endAngle: start + Math.PI * 0.76 }], stroke: i % 2 ? "rgba(255,243,184,0.68)" : "rgba(214,186,112,0.62)", lineWidth: 2.2, cap: "round", alpha: lifeFade, shadowColor: "rgba(244,211,107,0.42)", shadowBlur: 7 });
  }
  for (let i = 0; i < 4; i += 1) {
    const a = phase + (Math.PI * 2 * i) / 4;
    calls.push({ kind: "line", x1: hazard.x + Math.cos(a) * hazard.radius * 0.28, y1: hazard.y + Math.sin(a) * hazard.radius * 0.28, x2: hazard.x + Math.cos(a) * hazard.radius * 0.86, y2: hazard.y + Math.sin(a) * hazard.radius * 0.86, stroke: "rgba(255,255,255,0.44)", lineWidth: 1.4, cap: "round", alpha: lifeFade });
  }
  return group(hazard, calls, lifeFade);
}

function renderSpecialAoeHazard(hazard: HazardEntity, timing: HazardTimingState): Renderable[] | undefined {
  if (hazard.kind !== "aoe") return undefined;
  switch (hazard.effectKind) {
    case "meteor":
      return renderMeteor(hazard, timing);
    case "meteor-burn":
      return renderMeteorBurn(hazard, timing);
    case "gravity":
      return renderGravity(hazard, timing);
    case "consecrate":
      return renderConsecrate(hazard, timing);
    case "noxious":
      return renderNoxious(hazard, timing);
    case "arrowstorm":
      return renderArrowStorm(hazard, timing);
    case "smoke":
      return renderSmoke(hazard, timing);
    case "maelstrom":
      return renderMaelstrom(hazard, timing);
    case "bubble":
      return renderBubble(hazard, timing);
    case "whirlwind":
      return renderWhirlwind(hazard, timing);
    default:
      return undefined;
  }
}

export function createHazardRenderCalls(hazard: HazardEntity, timing?: HazardRenderTiming, out: Renderable[] = [], pool?: RenderFramePool): Renderable[] {
  const previousPool = activeRenderPool;
  activeRenderPool = pool;
  try {
  const hazardTiming = timingFor(hazard, timing);
  const armed = hazardTiming.armed;
  const warning = hazardTiming.warning;
  const lifeFade = armed ? clamp01(1 - hazardTiming.lifeT * 1.5) : 1;
  const eased = 1 - Math.pow(1 - warning, 3);
  const alpha = armed ? 0.38 : 0.08 + eased * 0.84;
  const palette =
    hazard.effectKind === "void"
      ? VOID_HAZARD_PALETTE
      : hazard.effectKind === "spark"
        ? SPARK_HAZARD_PALETTE
        : hazard.effectKind === "sap" || hazard.effectKind === "root"
          ? SAP_HAZARD_PALETTE
          : DEFAULT_HAZARD_PALETTE;
  const stroke = armed ? palette.armed : palette.warn;
  const fill = armed ? palette.fill : "rgba(255, 91, 91, 0.14)";
  const calls = hazardArray();

  if (hazard.effectKind === "immune" || hazard.effectKind === "dodge" || hazard.effectKind === "damage") {
    const text = hazard.text || (hazard.effectKind === "immune" ? "Immune" : hazard.effectKind === "dodge" ? "Dodge" : "Hit");
    const textFade = clamp01(1 - hazardTiming.lifeT);
    if (textFade <= 0) return out;
    const textY = hazard.y - 18 * hazardTiming.lifeT;
    const fill = hazard.effectKind === "immune" ? "#6de2ff" : hazard.effectKind === "dodge" ? "#fff3b8" : "#ffb36b";
    calls.push(
      { kind: "text", text, x: hazard.x, y: textY, font: "800 13px system-ui", align: "center", stroke: "rgba(0,0,0,0.78)", fill: "rgba(0,0,0,0)", lineWidth: 3, alpha: textFade },
      { kind: "text", text, x: hazard.x, y: textY, font: "800 13px system-ui", align: "center", fill, alpha: textFade }
    );
    return appendGroup(out, hazard, calls, textFade);
  }

  const projectile = hazard.combatState === "player-projectile" ? renderPlayerProjectile(hazard) : undefined;
  if (projectile) return appendRendered(out, projectile);
  const projectileTrace = renderProjectileTrace(hazard, hazardTiming);
  if (projectileTrace) return appendRendered(out, projectileTrace);
  const meleeWave = renderMeleeWaveHazard(hazard, hazardTiming);
  if (meleeWave) return appendRendered(out, meleeWave);

  if (hazard.effectKind === "cone") {
    const angle = Math.atan2(hazard.toY - hazard.y, hazard.toX - hazard.x);
    const half = ((hazard.pulse || 60) * Math.PI) / 180;
    const range = hazard.radius;
    const left = angle - half;
    const right = angle + half;
    calls.push(
      {
        kind: "path",
        commands: [
          { kind: "moveTo", x: hazard.x, y: hazard.y },
          { kind: "lineTo", x: hazard.x + Math.cos(left) * range, y: hazard.y + Math.sin(left) * range },
          { kind: "arc", x: hazard.x, y: hazard.y, radius: range, startAngle: left, endAngle: right },
          { kind: "lineTo", x: hazard.x, y: hazard.y },
          { kind: "closePath" }
        ],
        fill: "rgba(255, 98, 80, 0.044)",
        stroke: "rgba(255, 243, 184, 0.198)",
        lineWidth: 1
      }
    );
    return appendGroup(out, hazard, calls);
  }

  if (hazard.effectKind === "boulder" || hazard.effectKind === "boulders") {
    const dx = hazard.toX - hazard.x;
    const dy = hazard.toY - hazard.y;
    const length = Math.hypot(dx, dy) || 1;
    const count = hazard.effectKind === "boulders" ? 5 : 3;
    const progress = 0.08 + hazardTiming.lifeT * 0.92;
    calls.push({ kind: "line", x1: hazard.x, y1: hazard.y, x2: hazard.toX, y2: hazard.toY, stroke: "rgba(255,179,107,0.24)", lineWidth: Math.max(8, hazard.radius * 0.95), cap: "round", shadowColor: "rgba(255,139,122,0.46)", shadowBlur: 10 });
    for (let i = 0; i < count; i += 1) {
      const t = (i + 1) / (count + 1);
      const wobble = Math.sin((hazard.id.charCodeAt(i % hazard.id.length) + i) * 1.7) * hazard.radius * 0.55;
      const px = hazard.x + dx * t * progress + (-dy / length) * wobble;
      const py = hazard.y + dy * t * progress + (dx / length) * wobble;
      calls.push({ kind: "circle", x: px, y: py, radius: Math.max(3, hazard.radius * (0.2 + i * 0.025)), fill: "rgba(255, 179, 107, 0.82)", stroke: "rgba(255,243,184,0.7)", lineWidth: 1.2, shadowColor: "rgba(255,139,122,0.58)", shadowBlur: 7 });
    }
    return appendGroup(out, hazard, calls);
  }

  if (hazard.effectKind === "rushdust") {
    for (let i = 0; i < 7; i += 1) {
      const angle = (Math.PI * 2 * i) / 7;
      calls.push({ kind: "circle", x: hazard.x + Math.cos(angle) * hazard.radius * 0.7, y: hazard.y + Math.sin(angle) * hazard.radius * 0.35, radius: 2.2 + (i % 3), fill: "rgba(190, 162, 112, 0.46)" });
    }
    return appendGroup(out, hazard, calls);
  }

  if (hazard.effectKind === "crater") {
    const ageT = hazardTiming.lifeT;
    if (lifeFade <= 0) return out;
    const ring = hazard.radius * (0.42 + ageT * 0.82);
    calls.push(
      { kind: "circle", x: hazard.x, y: hazard.y, radius: ring, stroke: "rgba(255,243,184,0.72)", lineWidth: 2.8, shadowColor: "rgba(255,139,122,0.5)", shadowBlur: 10 },
      { kind: "circle", x: hazard.x, y: hazard.y, radius: hazard.radius * (0.28 + ageT * 0.35), fill: "rgba(255,98,80,0.16)", stroke: "rgba(255,179,107,0.58)", lineWidth: 1.8 }
    );
    for (let i = 0; i < 10; i += 1) {
      const a = (Math.PI * 2 * i) / 10 + 0.12;
      const inner = hazard.radius * (0.16 + (i % 2) * 0.08);
      const outer = hazard.radius * (0.44 + (i % 3) * 0.08 + ageT * 0.2);
      calls.push({ kind: "line", x1: hazard.x + Math.cos(a) * inner, y1: hazard.y + Math.sin(a) * inner, x2: hazard.x + Math.cos(a) * outer, y2: hazard.y + Math.sin(a) * outer, stroke: "rgba(245,214,142,0.35)", lineWidth: 1.3, cap: "round" });
    }
    return appendGroup(out, hazard, calls, lifeFade);
  }

  if (hazard.effectKind === "caltrops") {
    if (lifeFade <= 0) return out;
    const count = Math.max(10, Math.min(42, Math.floor(hazard.radius / 3)));
    calls.push({ kind: "circle", x: hazard.x, y: hazard.y, radius: hazard.radius, fill: "rgba(150, 170, 150, 0.08)", stroke: "rgba(220, 230, 195, 0.22)", lineWidth: 1.2, alpha: lifeFade });
    for (let i = 0; i < count; i += 1) {
      const seed = (hazard.id.charCodeAt(i % hazard.id.length) + i * 37) % 97;
      const angle = (seed / 97) * Math.PI * 2;
      const distance = hazard.radius * (0.12 + ((seed * 13) % 89) / 100);
      const x = hazard.x + Math.cos(angle) * distance;
      const y = hazard.y + Math.sin(angle) * distance;
      calls.push({ kind: "path", commands: [{ kind: "moveTo", x: x - 3, y: y + 2 }, { kind: "lineTo", x, y: y - 3 }, { kind: "lineTo", x: x + 3, y: y + 2 }], stroke: "rgba(232,232,210,0.64)", lineWidth: 1, cap: "round", alpha: lifeFade });
    }
    return appendGroup(out, hazard, calls, lifeFade);
  }

  const specialAoe = renderSpecialAoeHazard(hazard, hazardTiming);
  if (specialAoe) return appendRendered(out, specialAoe);

  if (hazard.kind === "line") {
    return appendRendered(out, renderLineHazard(hazard, hazardTiming, stroke, alpha));
  }

  if (lifeFade <= 0) return out;
  const playerEffect = hazard.effectKind === "dust" || hazard.effectKind === "whitehot";
  const radius = playerEffect ? hazard.radius * (0.74 + warning * 0.26) : hazard.radius * (0.42 + eased * 0.58);
  const aoeAlpha = (playerEffect ? 0.28 : alpha) * lifeFade;
  calls.push(
    { kind: "circle", x: hazard.x, y: hazard.y, radius, fill, stroke, lineWidth: armed ? 2 : 1.5, alpha: aoeAlpha, shadowColor: stroke, shadowBlur: armed ? 9 : 6 },
    { kind: "circle", x: hazard.x, y: hazard.y, radius: Math.max(4, hazard.radius * (0.2 + eased * 0.8)), stroke: "rgba(255,255,255,0.58)", lineWidth: 1, alpha: lifeFade }
  );
  return appendGroup(out, hazard, calls, hazard.kind === "aoe" ? lifeFade : 1);
  } finally {
    activeRenderPool = previousPool;
  }
}
