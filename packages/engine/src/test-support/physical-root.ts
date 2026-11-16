/** Independent support-step tolerance in world units per rendered frame. */
export function maximumSupportStep(frameRate: number) { return 1.5 / frameRate + 1e-6; }
