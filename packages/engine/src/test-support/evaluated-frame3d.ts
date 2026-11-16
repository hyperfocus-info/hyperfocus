import { sample3DFrame } from '../frame/3d.ts';
import { frameDeclarationFixture3D } from './frame3d.ts';

/** Complete evaluated frame from the production sampler, ready for fixture overrides. */
export function evaluatedFrameFixture3D() {
  return sample3DFrame({
    declaration: frameDeclarationFixture3D(), viewport: { width: 800, height: 600 },
    clock: { kind: 'simulation', tick: 0, ticksPerSecond: 60 },
  });
}
