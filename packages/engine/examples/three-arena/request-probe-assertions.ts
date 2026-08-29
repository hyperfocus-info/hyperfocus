const FOOT_SLIP_LIMIT_METERS = 0.02;
const PLANTED_VERTICAL_ERROR_LIMIT_METERS = 1e-4;
const TORSO_FOLD_LIMIT_RADIANS = 1.2;
const MINIMUM_HEAD_ABOVE_HIPS_METERS = 0.2;
const HIPS_AIM_DELTA_LIMIT_RADIANS = 0.05;
const GRIP_ERROR_LIMIT_METERS = 0.04;

type UnknownRecord = Record<string, unknown>;

export type EngineMotionCapabilitiesProbe = {
  aim: boolean;
  baseLocomotion: boolean;
  leftFootPlant: boolean;
  rightFootPlant: boolean;
};

export type EngineMotionMetricsProbe = {
  footSlipDistance: number;
  leftGripError: number;
  rightGripError: number;
  headAboveHipsMeters: number;
  hipsAimDeltaRadians: number;
  plantedVerticalError: number;
  poseChecksum: string;
  poseFinite: boolean;
  torsoFoldRadians: number;
};

export type EngineMotionSnapshotProbe = {
  active: boolean;
  capabilities: EngineMotionCapabilitiesProbe;
  lastPresentation: {
    landSource: string | null;
    recoilSource: string | null;
  };
  mappingValidated: boolean;
  metrics: EngineMotionMetricsProbe;
};

export type EngineMotionRequestProbe = {
  baseline: EngineMotionSnapshotProbe;
  landed: EngineMotionSnapshotProbe;
  extremeAim: {
    pitchRadians: number;
    up: EngineMotionSnapshotProbe;
    upReplay: EngineMotionSnapshotProbe;
    down: EngineMotionSnapshotProbe;
    downReplay: EngineMotionSnapshotProbe;
  };
  recoil: {
    before: EngineMotionSnapshotProbe;
    after: EngineMotionSnapshotProbe;
  };
};

export function parseEngineMotionSnapshotProbe(
  value: unknown,
  label = "engine motion snapshot",
): EngineMotionSnapshotProbe {
  const root = requiredRecord(value, label);
  const capabilities = requiredRecord(root.capabilities, `${label}.capabilities`);
  const metrics = requiredRecord(root.metrics, `${label}.metrics`);
  const lastPresentation = requiredRecord(root.lastPresentation, `${label}.lastPresentation`);
  return {
    active: requiredBoolean(root.active, `${label}.active`),
    capabilities: {
      aim: requiredBoolean(capabilities.aim, `${label}.capabilities.aim`),
      baseLocomotion: requiredBoolean(capabilities.baseLocomotion, `${label}.capabilities.baseLocomotion`),
      leftFootPlant: requiredBoolean(capabilities.leftFootPlant, `${label}.capabilities.leftFootPlant`),
      rightFootPlant: requiredBoolean(capabilities.rightFootPlant, `${label}.capabilities.rightFootPlant`),
    },
    lastPresentation: {
      landSource: nullableString(lastPresentation.landSource, `${label}.lastPresentation.landSource`),
      recoilSource: nullableString(lastPresentation.recoilSource, `${label}.lastPresentation.recoilSource`),
    },
    mappingValidated: requiredBoolean(root.mappingValidated, `${label}.mappingValidated`),
    metrics: {
      footSlipDistance: requiredFinite(metrics.footSlipDistance, `${label}.metrics.footSlipDistance`),
      leftGripError: requiredFinite(metrics.leftGripError, `${label}.metrics.leftGripError`),
      rightGripError: requiredFinite(metrics.rightGripError, `${label}.metrics.rightGripError`),
      headAboveHipsMeters: requiredFinite(metrics.headAboveHipsMeters, `${label}.metrics.headAboveHipsMeters`),
      hipsAimDeltaRadians: requiredFinite(metrics.hipsAimDeltaRadians, `${label}.metrics.hipsAimDeltaRadians`),
      plantedVerticalError: requiredFinite(metrics.plantedVerticalError, `${label}.metrics.plantedVerticalError`),
      poseChecksum: requiredString(metrics.poseChecksum, `${label}.metrics.poseChecksum`),
      poseFinite: requiredBoolean(metrics.poseFinite, `${label}.metrics.poseFinite`),
      torsoFoldRadians: requiredFinite(metrics.torsoFoldRadians, `${label}.metrics.torsoFoldRadians`),
    },
  };
}

export function parseEngineMotionRecoilProbe(
  value: unknown,
  label = "engine motion recoil probe",
): EngineMotionRequestProbe["recoil"] {
  const root = requiredRecord(value, label);
  return {
    before: parseEngineMotionSnapshotProbe(root.before, `${label}.before`),
    after: parseEngineMotionSnapshotProbe(root.after, `${label}.after`),
  };
}

export function collectEngineMotionProbeFailures(
  probe: EngineMotionRequestProbe,
): string[] {
  const failures: string[] = [];
  const snapshots: ReadonlyArray<readonly [string, EngineMotionSnapshotProbe]> = [
    ["baseline", probe.baseline],
    ["landed", probe.landed],
    ["aim-up", probe.extremeAim.up],
    ["aim-up-replay", probe.extremeAim.upReplay],
    ["aim-down", probe.extremeAim.down],
    ["aim-down-replay", probe.extremeAim.downReplay],
    ["recoil-before", probe.recoil.before],
    ["recoil-after", probe.recoil.after],
  ];
  for (const [label, snapshot] of snapshots) validateSnapshot(label, snapshot, failures);

  if (!Number.isFinite(probe.extremeAim.pitchRadians) || Math.abs(probe.extremeAim.pitchRadians) < 1) {
    failures.push(`extreme aim pitch ${String(probe.extremeAim.pitchRadians)}rad is not an extreme probe`);
  }
  if (probe.extremeAim.up.metrics.poseChecksum !== probe.extremeAim.upReplay.metrics.poseChecksum) {
    failures.push("extreme aim-up fixed-step replay was not deterministic");
  }
  if (probe.extremeAim.down.metrics.poseChecksum !== probe.extremeAim.downReplay.metrics.poseChecksum) {
    failures.push("extreme aim-down fixed-step replay was not deterministic");
  }
  if (probe.extremeAim.up.metrics.poseChecksum === probe.extremeAim.down.metrics.poseChecksum) {
    failures.push("extreme aim-up and aim-down produced the same pose checksum");
  }
  if (probe.landed.lastPresentation.landSource !== "engine-motion") {
    failures.push(`land presentation source was ${String(probe.landed.lastPresentation.landSource)}, expected engine-motion`);
  }
  if (probe.recoil.after.lastPresentation.recoilSource !== "engine-motion") {
    failures.push(`recoil presentation source was ${String(probe.recoil.after.lastPresentation.recoilSource)}, expected engine-motion`);
  }
  if (probe.recoil.before.metrics.poseChecksum === probe.recoil.after.metrics.poseChecksum) {
    failures.push("engine-motion recoil did not change the pose checksum");
  }
  return failures;
}

export function assertEngineMotionRequestProbe(probe: EngineMotionRequestProbe): void {
  const failures = collectEngineMotionProbeFailures(probe);
  if (failures.length > 0) throw new Error(failures.join("\n"));
}

function validateSnapshot(
  label: string,
  snapshot: EngineMotionSnapshotProbe,
  failures: string[],
) {
  if (!snapshot.active) failures.push(`${label}: engine motion is inactive`);
  if (!snapshot.mappingValidated) failures.push(`${label}: semantic mapping is unvalidated`);
  for (const capability of ["baseLocomotion", "leftFootPlant", "rightFootPlant", "aim"] as const) {
    if (!snapshot.capabilities[capability]) failures.push(`${label}: ${capability} capability is disabled`);
  }
  const metrics = snapshot.metrics;
  if (!metrics.poseFinite) failures.push(`${label}: pose is non-finite`);
  if (metrics.footSlipDistance >= FOOT_SLIP_LIMIT_METERS) {
    failures.push(`${label}: planted slip ${metrics.footSlipDistance}m is not below ${FOOT_SLIP_LIMIT_METERS}m`);
  }
  if (metrics.leftGripError > GRIP_ERROR_LIMIT_METERS || metrics.rightGripError > GRIP_ERROR_LIMIT_METERS) {
    failures.push(
      `${label}: crossbow grip error ${metrics.leftGripError}m/${metrics.rightGripError}m exceeds ${GRIP_ERROR_LIMIT_METERS}m`,
    );
  }
  if (metrics.plantedVerticalError > PLANTED_VERTICAL_ERROR_LIMIT_METERS) {
    failures.push(
      `${label}: planted vertical error ${metrics.plantedVerticalError}m exceeds ${PLANTED_VERTICAL_ERROR_LIMIT_METERS}m`,
    );
  }
  if (metrics.torsoFoldRadians >= TORSO_FOLD_LIMIT_RADIANS) {
    failures.push(`${label}: torso fold ${metrics.torsoFoldRadians}rad is not below ${TORSO_FOLD_LIMIT_RADIANS}rad`);
  }
  if (metrics.headAboveHipsMeters <= MINIMUM_HEAD_ABOVE_HIPS_METERS) {
    failures.push(
      `${label}: head is only ${metrics.headAboveHipsMeters}m above hips; expected more than ${MINIMUM_HEAD_ABOVE_HIPS_METERS}m`,
    );
  }
  if (Math.abs(metrics.hipsAimDeltaRadians) > HIPS_AIM_DELTA_LIMIT_RADIANS) {
    failures.push(
      `${label}: hips absorbed ${metrics.hipsAimDeltaRadians}rad of aim; expected at most ${HIPS_AIM_DELTA_LIMIT_RADIANS}rad`,
    );
  }
}

function requiredRecord(value: unknown, label: string): UnknownRecord {
  if (!isRecord(value)) throw new TypeError(`${label} must be an object`);
  return value;
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new TypeError(`${label} must be a boolean`);
  return value;
}

function requiredFinite(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new TypeError(`${label} must be finite`);
  return value;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) throw new TypeError(`${label} must be a non-empty string`);
  return value;
}

function nullableString(value: unknown, label: string): string | null {
  if (value === null || typeof value === "string") return value;
  throw new TypeError(`${label} must be a string or null`);
}
