import { applyEngineUiTheme } from "@hyperfocus/engine/ui";

export const PERF_QUERY = new URLSearchParams(location.search.replace(/%3B/gi, "&").replace(/;/g, "&"));
export const PERF_FLAGS = {
  batchPickups: readPerfFlag("batchPickups", true),
  batchParticles: readPerfFlag("batchParticles", true),
  propCollisionGrid: readPerfFlag("propCollisionGrid", true) || PERF_QUERY.get("allowSlowPropCollision") !== "1",
  enemySpatialGrid: readPerfFlag("enemySpatialGrid", true),
  staticPropBsp: readPerfFlag("staticPropBsp", true),
  staticPropLod: readPerfFlag("staticPropLod", false),
  staticModelProps: readPerfFlag("staticModelProps", false),
  benchWalkOnly: readPerfFlag("benchWalkOnly", false),
  benchNoLevelChoices: readPerfFlag("benchNoLevelChoices", false),
  benchInvulnerable: readPerfFlag("benchInvulnerable", false),
  telemetryPanel: readPerfFlag("telemetryPanel", true),
  shadows: readPerfFlag("shadows", true),
  maxAnimatedEnemies: Math.max(0, Math.floor(readPerfNumber("animatedEnemies", 4))),
  enemyTerrainBudget: readPerfNumber("enemyTerrainBudget", 32),
  enemyTerrainNearRadius: readPerfNumber("enemyTerrainNearRadius", 16),
  enemyDenseTerrainNearRadius: readPerfNumber("enemyDenseTerrainNearRadius", 8),
  enemyTerrainStepSeconds: readPerfNumber("enemyTerrainStepSeconds", 0.16),
  farEnemyPropCollision: readPerfFlag("farEnemyPropCollision", true),
  enemyHealthBars: readPerfFlag("enemyHealthBars", true),
  enemyBillboardFrameStep: Math.max(1, Math.floor(readPerfNumber("enemyBillboardFrameStep", 1))),
  pulseRingsBatched: readPerfFlag("pulseRingsBatched", false)
};
applyEngineUiTheme(document.documentElement, {
  surface: "#080b0d",
  surfaceAlt: "#111a14",
  border: "rgba(190, 228, 160, 0.28)",
  accent: "#d7ff8d",
  accentText: "#06100a",
  text: "#eef5ed",
  muted: "#dbefcf",
  danger: "#ff6658",
  success: "#a8ff7d",
  focusRing: "rgba(171, 221, 126, 0.45)",
  controlSurface: "rgba(39, 59, 43, 0.92)",
  controlSurfaceHover: "rgba(61, 91, 62, 0.96)",
  controlBorder: "rgba(202, 226, 183, 0.35)",
  controlText: "#f3ffe7",
  inputSurface: "rgba(8, 13, 11, 0.86)",
  radius: "0px",
  shadow: "0 8px 22px rgba(0, 0, 0, 0.3)"
});
function readPerfFlag(name: string, fallback: boolean): boolean {
  const value = PERF_QUERY.get(name);
  if (value === null) return fallback;
  return !["0", "false", "off", "no"].includes(value.toLowerCase());
}
function readPerfNumber(name: string, fallback: number): number {
  const raw = PERF_QUERY.get(name);
  if (raw === null) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}
