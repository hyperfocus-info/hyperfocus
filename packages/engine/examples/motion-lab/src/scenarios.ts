export const LAB_SCENARIO_IDS = ["forward", "backward", "strafe", "aim", "slope", "stairs"] as const;

export type LabScenarioId = (typeof LAB_SCENARIO_IDS)[number];
export type LabTerrainKind = "flat" | "slope" | "stairs";

export type LabControls = {
  aimPitchDegrees: number;
  aimYawDegrees: number;
  speedMetersPerSecond: number;
};

export type LabSignals = {
  acceleration: readonly [number, number, number];
  aimPitch: number;
  aimWeight: number;
  aimYaw: number;
  desiredVelocity: readonly [number, number, number];
  groundNormal: readonly [number, number, number];
  isGrounded: boolean;
  terrain: LabTerrainKind;
  turnRate: number;
};

export const DEFAULT_LAB_CONTROLS: Readonly<LabControls> = {
  aimPitchDegrees: 38,
  aimYawDegrees: 18,
  speedMetersPerSecond: 2.4,
};

export const SCENARIO_LABELS: Readonly<Record<LabScenarioId, string>> = {
  aim: "Aim",
  backward: "Backward",
  forward: "Forward",
  slope: "15° Slope",
  stairs: "Stairs",
  strafe: "Strafe",
};

const DEG_TO_RAD = Math.PI / 180;
const SLOPE_RADIANS = 15 * DEG_TO_RAD;
const STAIR_TREAD_METERS = 0.4;
const STAIR_RISE_METERS = 0.12;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, Number.isFinite(value) ? value : minimum));
}

export function normalizeLabControls(controls: Partial<LabControls> = {}): LabControls {
  return {
    aimPitchDegrees: clamp(controls.aimPitchDegrees ?? DEFAULT_LAB_CONTROLS.aimPitchDegrees, -75, 75),
    aimYawDegrees: clamp(controls.aimYawDegrees ?? DEFAULT_LAB_CONTROLS.aimYawDegrees, -70, 70),
    speedMetersPerSecond: clamp(controls.speedMetersPerSecond ?? DEFAULT_LAB_CONTROLS.speedMetersPerSecond, 0, 5),
  };
}

export function resolveLabSignals(
  scenario: LabScenarioId,
  controlsInput: Partial<LabControls> = {},
): LabSignals {
  const controls = normalizeLabControls(controlsInput);
  const speed = controls.speedMetersPerSecond;
  let desiredVelocity: readonly [number, number, number] = [0, 0, 0];
  let terrain: LabTerrainKind = "flat";

  switch (scenario) {
    case "forward":
      desiredVelocity = [0, 0, speed];
      break;
    case "backward":
      desiredVelocity = [0, 0, -speed * 0.78];
      break;
    case "strafe":
      desiredVelocity = [speed * 0.86, 0, 0];
      break;
    case "aim":
      desiredVelocity = [0, 0, 0];
      break;
    case "slope":
      desiredVelocity = [0, 0, speed * 0.82];
      terrain = "slope";
      break;
    case "stairs":
      desiredVelocity = [0, 0, speed * 0.68];
      terrain = "stairs";
      break;
  }

  const groundNormal: readonly [number, number, number] = terrain === "slope"
    ? [0, Math.cos(SLOPE_RADIANS), -Math.sin(SLOPE_RADIANS)]
    : [0, 1, 0];
  return {
    acceleration: [0, 0, 0],
    aimPitch: controls.aimPitchDegrees * DEG_TO_RAD,
    aimWeight: scenario === "aim" ? 1 : 0.34,
    aimYaw: controls.aimYawDegrees * DEG_TO_RAD,
    desiredVelocity,
    groundNormal,
    isGrounded: true,
    terrain,
    turnRate: scenario === "strafe" ? -0.65 : 0,
  };
}

export function terrainHeightAt(kind: LabTerrainKind, x: number, z: number): number {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return 0;
  if (kind === "slope") return z * Math.tan(SLOPE_RADIANS);
  if (kind === "stairs") {
    const index = Math.max(-5, Math.min(5, Math.floor((z + STAIR_TREAD_METERS * 0.5) / STAIR_TREAD_METERS)));
    return index * STAIR_RISE_METERS;
  }
  return 0;
}

export function scenarioFromKeyboard(code: string): LabScenarioId | null {
  switch (code) {
    case "KeyW": return "forward";
    case "KeyS": return "backward";
    case "KeyA":
    case "KeyD": return "strafe";
    case "Digit1": return "slope";
    case "Digit2": return "stairs";
    case "KeyF": return "aim";
    default: return null;
  }
}
