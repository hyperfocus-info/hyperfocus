import type { CityFinishKit } from './kit.ts';

/** Traces of ordinary use cluster at actual rooms, counters and delivery bays. */
export function authorCivilianFinishes({ kit }: { kit: CityFinishKit }) {
  const { box } = kit;
  const host = (district: string, part: string) => `tod:city:overhaul:${district}:${part}`;
  for (const index of [0, 1]) {
    const counter = host('market', `aisle:${index}:counter`);
    // Recessed serving drawers and a folded counter cloth are fittings, not fake pickups.
    for (const side of [-1, 1]) {
      box(`market:${index}:drawer:${side}`, 'canvas-stripe', [side * 1.4, -.12, .775], [1.1, .27, .02], counter);
      box(`market:${index}:drawer-pull:${side}`, 'paving-edge', [side * 1.4, -.1, .806], [.24, .025, .025], counter);
    }
    box(`market:${index}:folded-cloth`, index ? 'canvas-stripe' : 'canvas', [-2.15, .72, -.08], [.45, .025, .46], counter);
    const back = host('market', `hall:${index}:back`);
    // Closed shop shutters contrast with the open stall counters in front.
    box(`market:${index}:notice`, 'paper', [-2.25, -1.1, .582], [.22, .32, .008], back);
  }
  const apartment = host('residential', 'apartment:wall:-1');
  box('residential:notice-board', 'rust', [.205, .35, -1.8], [.018, .65, .6], apartment);
  for (const [index, z] of [-2.08, -1.52].entries()) box(`residential:notice:${index}`, 'paper', [.231, .35 + index * .14, z], [.006, .38, .2], apartment);
  // Cloth draped inside selected balcony rails breaks machine repetition at human scale.
  for (const [floor, z] of [-28.8, -21, -25.4].entries()) {
    const rail = host('residential', `west:rail:${floor}`);
    box(`residential:laundry:${floor}`, floor === 1 ? 'canvas' : 'residential', [-.09, -.05, z + 24], [.025, .39, .6], rail);
  }
  for (const entity of kit.entities.values()) {
    if (!/tod:city:overhaul:residential:(?:west:window:|north:window:)/.test(entity.id)) continue;
    const room = Number(entity.id.split(':').at(-1));
    if (room % 3 !== 1) continue;
    // A few rooms remain lit after evacuation; others stay dark and repetitive.
    const owner = entity.id.includes(':west:') ? host('residential', 'west-wing') : host('residential', 'north:wing');
    entity.materialId = kit.materialFor('glass-lit', owner);
    const source = kit.entities.get(owner)!;
    const xFace = entity.id.includes(':west:');
    box(`residential:blind:${entity.id.split(':').slice(-4).join(':')}`, 'canvas',
      [entity.position[0] - source.position[0] + (xFace ? .05 : 0), entity.position[1] - source.position[1] + .32,
        entity.position[2] - source.position[2] + (xFace ? 0 : .05)], xFace ? [.012, .19, .55] : [.55, .19, .012], owner);
  }
  for (const index of [0, 1]) {
    const cargo = host('depot', `cargo:${index}:body`);
    box(`depot:cargo:${index}:delivery-note`, 'paper', [-2.05, .6, 1.481], [.29, .34, .007], cargo);
    const shelter = host('depot', `shelter:${index}:service-island`);
    box(`depot:${index}:seat-inset`, 'transit', [0, .59, 0], [1.65, .016, .32], shelter);
    for (const x of [-1.1, 0, 1.1]) box(`depot:${index}:seat-joint:${x}`, 'structure', [x, .61, 0], [.018, .003, .32], shelter);
  }
  const office = host('construction', 'site-office:wall:-1');
  box('construction:job-board', 'canvas', [-.185, .22, -1.25], [.016, .7, .75], office);
  for (const z of [-1.6, -.95]) box(`construction:plan:${z}`, 'paper', [-.212, .25, z], [.006, .5, .25], office);
}
