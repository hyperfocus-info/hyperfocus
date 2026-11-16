export function initialDashState() {
  return { dashFollowupFrames: 0, stepSlowFrames: 0, dashAirborne: false, dashAge: 0, dashDuration: 0, dashCancelX: 0, dashCancelZ: 0, dashCancelFrames: 0, dashCancelDuration: 0 };
}

export function readDashState(value: Record<string, unknown>) {
  const result = initialDashState();
  for (const key of ['dashFollowupFrames', 'stepSlowFrames', 'dashAge', 'dashDuration', 'dashCancelFrames', 'dashCancelDuration', 'dashCancelX', 'dashCancelZ'] as const) {
    const raw = value[key];if (raw === undefined) continue;
    const frames = key !== 'dashCancelX' && key !== 'dashCancelZ';
    if (typeof raw !== 'number' || !Number.isFinite(raw) || Math.abs(raw) > 600 || frames && (!Number.isInteger(raw) || raw < 0)) throw Error('Invalid saved dash transition');
    result[key] = raw;
  }
  if (value.dashAirborne !== undefined && typeof value.dashAirborne !== 'boolean') throw Error('Invalid dash launch origin');
  result.dashAirborne = value.dashAirborne === true;
  if (result.dashFollowupFrames > 7 || result.stepSlowFrames > 6) throw Error('Invalid movement grace timing');
  if (result.dashAge > result.dashDuration || result.dashCancelFrames > result.dashCancelDuration || result.dashCancelDuration > 12) throw Error('Invalid dash transition timing');
  return result;
}
