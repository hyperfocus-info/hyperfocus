import { finishFighterDetails } from './fighter-finish.ts';
import { finishWardrobeModels } from './wardrobe-finish.ts';
import { trouserProfile } from './trouser-profile.ts';
import { addTelemetryEquipment } from '../cosmetics/telemetry.ts';
import type { ArtFixture } from './fixture.ts';
import { cookFighterProfile } from '../fighter-profile.ts';
import { cookPrimitiveModel } from '@hyperfocus/engine/assets/model-cooking';
import { finishServiceJacket, type ServiceTreatment } from './service-jacket.ts';

/** Detail follows selected C massing. No random ornaments or texture noise. */
export function refineFighter(fixture: ArtFixture, id: string, opponent = false, treatment: ServiceTreatment = 'utility', preserveWardrobe = false) {
  const entity = (part: string) => fixture.scene.entities.find(item => item.id === `${id}:${part}`)!;
  const add = (part: string, material: string, position: [number, number, number], scale: [number, number, number]) => fixture.add(`${id}:${part}`, 'box', material, position, scale);
  const head = entity('head');
  const headRings: Parameters<typeof cookFighterProfile>[1] = [
    [1.73, .046, .057, .026], [1.765, .065, .078, .026], [1.80, .08, .095, .020],
    [1.85, .105, .10, .008, .008], [1.89, .103, .103, 0, .012],
    [1.945, .09, .10, -.006], [1.98, .01, .01, -.01],
  ];
  const headModel = fixture.model(`${id}:refined-head`, cookFighterProfile('Angular cheek and jaw planes', headRings.map(([y, w, d, z, ridge]) => [y - 1.855, w, d, z, ridge])));
  head.meshId = headModel; head.position = [0, 1.855, 0];
  entity('neck').meshId = fixture.model(`${id}:neck-transition`, cookFighterProfile('Neck below jaw plane', [[1.635, .064, .065, -.008], [1.716, .051, .054, -.012], [1.748, .042, .045, -.012]]));
  const hair = entity('hair');
  hair.meshId = fixture.model(`${id}:swept-hair`, cookFighterProfile('Swept cropped hair', [
    [1.885, .105, .098, -.01], [1.93, .112, .11, -.013], [1.97, .09, .10, -.025], [2.005, .03, .065, -.048], [2.01, .001, .001, -.05],
  ]));
  for (const side of [-1, 1]) {
    add(`brow:${side}`, 'ink', [side * .05, 1.882, .092], [.025, .003, .002]).rotationY = side * .52;
    add(`eye:${side}`, 'ink', [side * .05, 1.867, .097], [.019, .005, .001]).rotationY = side * .52;
    add(`eye-light:${side}`, 'wrap', [side * .046, 1.869, .099], [.010, .0015, .001]).rotationY = side * .52;
  }
  const nose = fixture.model(`${id}:nose-model`, cookFighterProfile('Nose bridge', [[-.037, .015, .008, 0], [-.026, .022, .026, .009], [.005, .012, .013, .003], [.043, .005, .003, 0]]));
  fixture.add(`${id}:nose`, nose, 'skin', [0, 1.846, .107]);
  add('mouth', 'ink', [0, 1.783, .11], [.027, .003, .002]);
  // Owner-selected service-worker identity. Three readable masses: cropped
  // jacket, reinforced trousers, work boots. Hardware stays subordinate.
  const torso = entity('torso');
  torso.meshId = fixture.model(`${id}:work-jacket`, cookFighterProfile('Cropped work jacket', [
    [1.045, .178, .13, 0], [1.09, .18, .135, 0], [1.17, .184, .138, 0],
    [1.40, .243, .165, 0], [1.58, .281, .15, 0], [1.635, .20, .12, 0], [1.68, .083, .075, 0],
  ]));
  const hem = fixture.model(`${id}:jacket-hem`, cookFighterProfile('Bound jacket hem', [[1.028, .18, .132, 0], [1.06, .183, .136, 0]]));
  fixture.add(`${id}:hem`, hem, 'ink', [0, 0, 0]);
  const collar = fixture.model(`${id}:standing-collar`, cookFighterProfile('Folded work collar', [[1.64, .087, .078, 0], [1.708, .078, .071, 0]]));
  fixture.add(`${id}:collar`, collar, opponent ? 'opponent' : 'cloth', [0, 0, 0]);
  add('closure', 'ink', [0, 1.39, .163], [.009, .205, .009]);
  add('zip-pull', 'wrap', [0, 1.54, .179], [.014, .025, .007]);
  add('pocket', 'ink', [-.137, 1.475, .152], [.058, .063, .012]);
  add('pocket-flap', opponent ? 'opponent' : 'cloth', [-.137, 1.52, .169], [.06, .016, .009]);
  for (const sign of [-1, 1]) {
    const side = sign < 0 ? 'left' : 'right';
    const forearmLength = Math.hypot(.045, .26, .025);
    const sleeveLength = Math.hypot(.105, .255, .035);
    entity(`${side}-sleeve`).meshId = fixture.model(`${id}:${side}-tapered-sleeve`, cookFighterProfile('Work sleeve meeting tapered forearm', [
      [-sleeveLength / 2, .055, .052, 0], [-sleeveLength * .3, .066, .062, 0],
      [sleeveLength * .3, .084, .081, 0], [sleeveLength / 2, .077, .073, 0],
    ]));
    entity(`${side}-forearm`).meshId = fixture.model(`${id}:${side}-tapered-forearm`, cookFighterProfile('Tapered athletic forearm', [
      [-forearmLength / 2, .032, .030, 0], [-forearmLength * .28, .036, .033, 0],
      [forearmLength * .10, .047, .042, .004], [forearmLength * .31, .052, .045, .004], [forearmLength / 2, .046, .040, 0],
    ]));
    const hand = entity(`${side}-hand`);
    hand.meshId = fixture.model(`${id}:${side}-fist`, cookFighterProfile('Folded knuckle plane', [
      [-.065, .035, .033, 0], [-.018, .043, .040, 0], [.018, .059, .044, .012], [.072, .059, .044, .016], [.086, .050, .034, .016],
    ], 'hand'));
    hand.materialId = 'skin';
    const wrap = fixture.model(`${id}:${side}-wrist-wrap`, cookFighterProfile('Bound wrist wrap', [[-.07, .036, .034, 0], [-.018, .045, .042, 0]], 'hand'));
    fixture.add(`${id}:${side}-wrist-wrap`, wrap, 'wrap', [0, 0, 0]);
    const seams = fixture.model(`${id}:${side}-knuckle-folds`, cookPrimitiveModel({ label: 'Finger folds', parts: [-.029, 0, .029].map(x => ['box', x, .087, .016, .0015, .001, .022, 0, 0, 0]) }));
    fixture.add(`${id}:${side}-knuckle-folds`, seams, 'ink', [0, 0, 0]);
    const thumb = fixture.model(`${id}:${side}-thumb-model`, cookFighterProfile('Folded thumb', [[-.035, .008, .01, 0], [-.021, .026, .024, 0], [.016, .023, .02, 0], [.032, .008, .009, 0]]));
    fixture.add(`${id}:${side}-thumb`, thumb, 'skin', [hand.position[0] - sign * .044, hand.position[1] - .008, hand.position[2] + .025]);
    entity(`${side}-thigh`).meshId = fixture.model(`${id}:${side}-work-trousers`, cookFighterProfile('Reinforced trouser knee', trouserProfile('thigh')));
    entity(`${side}-shin`).meshId = fixture.model(`${id}:${side}-trouser-cuff`, cookFighterProfile('Tapered work trouser cuff with rounded knee transition', trouserProfile('shin')));
    entity(`${side}-shoe`).meshId = fixture.model(`${id}:${side}-work-boot`, cookFighterProfile('Practical work boot', [
      [.04, .078, .146, .035], [.075, .081, .15, .035], [.11, .072, .123, .035],
      [.16, .060, .078, -.004], [.26, .055, .064, -.015],
    ]));
    const sole = fixture.model(`${id}:${side}-sole-model`, cookFighterProfile('Work boot sole', [[.012, .081, .15, .035], [.04, .085, .153, .035]]));
    fixture.add(`${id}:${side}-sole`, sole, 'structure', [0, 0, 0]);
  }
  finishServiceJacket(fixture, id, treatment, preserveWardrobe);
  finishFighterDetails(fixture, id);
  if (preserveWardrobe) finishWardrobeModels(fixture, id);
  if (preserveWardrobe) addTelemetryEquipment(fixture, id);
}

export function refineCourtyard(fixture: ArtFixture) {
  const box = (id: string, material: string, p: [number, number, number], s: [number, number, number]) => fixture.add(`court:${id}`, 'box', material, p, s);
  fixture.scene.camera = { position: [3.3, 3.6, 9.8], target: [0, 1.45, -1], up: [0, 1, 0], fovYRadians: .70, near: .1, far: 100 };
  fixture.scene.lights[0]!.intensity = .68;
  fixture.scene.lights[1]!.intensity = 1.8;
  const floor = fixture.declaration.materials.find(material => material.id === 'floor')!;
  floor.baseColor = [.33, .35, .34, 1];
  const concrete = fixture.declaration.materials.find(material => material.id === 'concrete')!;
  concrete.baseColor = [.26, .29, .30, 1];
  for (const sign of [-1, 1]) {
    for (const z of [-5.8, -2.5]) for (const y of [1.4, 4.2]) {
      box(`window:${sign}:${z}:${y}`, 'recess', [sign * 4.285, y, z], [.018, .65, .72]);
      box(`sill:${sign}:${z}:${y}`, 'structure', [sign * 4.22, y - .69, z], [.13, .06, .83]);
    }
    box(`bridge-support:${sign}`, 'structure', [sign * 4.25, 2.3, -2.7], [.13, 2.3, .14]);
    box(`service-inset:${sign}`, 'recess', [sign * 5.1, .53, .207], [.43, .43, .012]);
    box(`service-panel:${sign}`, 'structure', [sign * 5.1, .53, .223], [.39, .39, .013]);
    for (const y of [.28, .78]) box(`service-hinge:${sign}:${y}`, 'concrete', [sign * 5.1 - .4, y, .248], [.022, .045, .012]);
  }
  box('bridge-rail', 'structure', [0, 5.55, -1.68], [4.35, .06, .045]);
  for (const x of [-4.2, -2.1, 0, 2.1, 4.2]) box(`rail-post:${x}`, 'structure', [x, 5.2, -1.68], [.035, .35, .04]);
  box('bridge-inset', 'concrete', [0, 4.8, -1.635], [3.6, .16, .02]);
  box('door-jamb-left', 'concrete', [-1.15, 1.5, -6.5], [.12, 1.5, .2]);
  box('door-jamb-right', 'concrete', [1.15, 1.5, -6.5], [.12, 1.5, .2]);
  box('door-pull', 'orange', [.65, 1.4, -6.4], [.025, .2, .035]);
  box('camera-arm', 'structure', [-2.2, 3.65, -6.3], [.2, .035, .09]);
  box('camera-body', 'technology', [-2.2, 3.6, -6.15], [.09, .055, .15]);
  for (const x of [-6, -3, 0, 3, 6]) box(`floor-joint:${x}`, 'structure', [x, .004, -.8], [.007, .004, 5.5]);
  box('drain', 'recess', [0, .005, -4.8], [3.8, .005, .11]);
  for (const z of [-3.4, 2.3]) box(`threshold:${z}`, 'route', [0, .006, z], [.5, .006, .017]);
}
