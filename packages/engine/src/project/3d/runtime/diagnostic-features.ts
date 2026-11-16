/** Session-local subsystem ablations. Hosts must keep them out of deterministic network sessions. */
export function createRuntimeDiagnosticFeatures3D() {
  const features = { mainPhysics: true, environmentMotion: true, ai: true, combat: true, koPhysics: true, traffic: true, hazards: true };
  return {
    features,
    set(patch: Partial<typeof features>) {
      for (const [key, value] of Object.entries(patch)) {
        if (!Object.hasOwn(features, key) || typeof value !== 'boolean') throw Error(`Invalid diagnostic feature: ${key}`);
      }
      Object.assign(features, patch);
    },
  };
}
