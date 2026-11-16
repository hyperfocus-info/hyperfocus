import { cookPrimitiveModel } from '@hyperfocus/engine/assets/model-cooking';
import { cookFighterProfile } from './fighter-profile.ts';
import { cookTouchOfDeathImpactModel } from './effects-model.ts';

export function cookTouchOfDeathModels() {
  return {
    impact: cookTouchOfDeathImpactModel(),
    fighter: { name: 'touch-of-death-fighter.glb', bytes: cookFighterProfile('Tailored martial arts tunic', [
      [-.31, .01, .01, 0], [-.29, .265, .174, 0], [-.255, .271, .181, 0],
      [-.22, .262, .171, 0], [-.12, .248, .164, 0], [-.02, .252, .169, 0],
      [.08, .276, .182, -.005], [.2, .302, .19, -.01], [.3, .309, .19, -.018],
      [.38, .292, .17, -.026], [.44, .244, .14, -.03], [.49, .115, .092, -.024], [.51, .01, .01, -.024],
    ], 'jacket') },
    // Primitive boxes already span [-1, 1]; scene scales are collider half extents.
    box: { name: 'touch-of-death-box.glb', bytes: cookPrimitiveModel({ label: 'Touch of Death arena block', parts: [['box', 0, 0, 0, 1, 1, 1, 0, 0, 0]] }) },
    sphere: { name: 'touch-of-death-sphere.glb', bytes: cookPrimitiveModel({ label: 'Touch of Death impact sphere', parts: [['sphere', 0, 0, 0, 1, 1, 1, 0, 0, 0]] }) },
  };
}
