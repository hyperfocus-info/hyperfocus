import type { CombatProject3D } from '@hyperfocus/engine/project/runtime-3d';
import type { DistrictKit, Positions, Vec3 } from './kit.ts';

type Layout = NonNullable<CombatProject3D['arenaLayouts']>[number];
const digits: Record<number, readonly number[]> = { 1: [1, 2], 2: [0, 1, 6, 4, 3], 3: [0, 1, 6, 2, 3], 4: [5, 6, 1, 2], 5: [0, 5, 6, 2, 3] };
const segments: readonly [Vec3, Vec3][] = [
  [[0, .32, 0], [.16, .025, .012]], [[.18, .16, 0], [.025, .14, .012]],
  [[.18, -.16, 0], [.025, .14, .012]], [[0, -.32, 0], [.16, .025, .012]],
  [[-.18, -.16, 0], [.025, .14, .012]], [[-.18, .16, 0], [.025, .14, .012]],
  [[0, 0, 0], [.16, .025, .012]],
];

/** Small repeated hardware reveals the simulation without turning buildings into signs. */
export function authorDistrictExperiment({ kit, layout, seed, district, number }: {
  kit: DistrictKit; layout: Layout; seed: number; district: string; number: number;
}) {
  const anchor = district === 'construction' ? 'site-office:wall:-1'
    : district === 'market' ? 'hall:0:back' : district === 'residential' ? 'entrance:0:wall'
      : district === 'depot' ? 'dispatch:body' : 'gallery:rear';
  const owner = `tod:city:overhaul:${district}:${anchor}`;
  const phase = (seed >>> 0) % 3;
  const readOrigin = (index: number): Vec3 => {
    const placement = layout.variants[(index - phase + 3) % 3]!.props.find(prop => prop.entityId === owner);
    if (!placement) throw Error(`Experiment hardware needs ${owner}.`);
    return [...placement.position];
  };
  const origin = [readOrigin(0), readOrigin(1), readOrigin(2)];
  const xFace = district === 'construction';
  const panel: Vec3 = xFace ? [-.19, .15, .9] : district === 'utility' ? [0, .1, .205]
    : district === 'market' ? [-2, -1.2, .48] : district === 'depot' ? [0, -.4, .7] : [.45, -.1, .24];
  const place = (offset: Vec3): Positions => {
    const translate = (p: Vec3): Vec3 => [p[0] + panel[0] + (xFace ? offset[2] : offset[0]),
      p[1] + panel[1] + offset[1], p[2] + panel[2] + (xFace ? offset[0] : offset[2])];
    return [translate(origin[0]!), translate(origin[1]!), translate(origin[2]!)];
  };
  const scale = (v: Vec3): Vec3 => xFace ? [v[2], v[1], v[0]] : v;
  const faceDepth = xFace ? -.025 : .025;
  // One restrained wall number should survive the ordinary combat camera.
  // Keep the number larger than its concealed lens, without adding a billboard.
  const numberScale = 1.6;
  kit.box('experiment:zone:plate', 'steel', place([0, 0, 0]), scale([.54, .73, .012]), false, owner);
  for (const segment of digits[number]!) {
    const [position, half] = segments[segment]!;
    kit.box(`experiment:zone:digit:${segment}`, 'chalk', place([position[0] * numberScale, position[1] * numberScale, faceDepth]),
      scale([half[0] * numberScale, half[1] * numberScale, half[2]]), false, owner);
  }
  if (district !== 'residential' && district !== 'utility') kit.box('experiment:zone:registration', 'chalk', place([-.29, -.4, faceDepth]), scale([.035, .015, .012]), false, owner);
  // Identical concealed camera dimensions in otherwise different districts are intentional.
  if (district !== 'residential' && district !== 'utility') kit.box('experiment:camera:hood', 'steel', place([.72, .7, 0]), scale([.23, .1, .18]), false, owner);
  const concealed = district === 'residential' || district === 'utility';
  kit.box('experiment:camera:lens', 'paint', place([.72, concealed ? .9 : .7, concealed ? faceDepth : xFace ? -.185 : .185]), scale([.075, .045, .012]), false, owner);
  if (district !== 'residential') kit.box('experiment:maintenance:seam', 'fracture', place([-.47, 0, faceDepth]), scale([.012, .56, .006]), false, owner);
  if (district !== 'residential' && district !== 'utility') kit.box('experiment:maintenance:latch', 'steel', place([-.42, -.3, faceDepth]), scale([.025, .06, .012]), false, owner);
  if (district === 'utility') {
    // The observation gallery exposes a little machinery behind a maintenance slit.
    kit.box('experiment:machine:recess', 'fracture', place([3.2, 0, .03]), [1.05, .5, .015], false, owner);
    for (const x of [2.5, 3.2, 3.9]) {
      kit.box(`experiment:machine:rack:${x}`, 'steel', place([x, 0, .06]), [.15, .39, .04], false, owner);
    }
    kit.box('experiment:machine:indicator', 'paint', place([3.2, .22, .105]), [.045, .045, .012], false, owner);
  }
}
