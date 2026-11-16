import type { CityFinishKit } from './kit.ts';

/** Ground is a designed public surface; roads remain the dark negative space. */
export function authorCityGround({ kit }: { kit: CityFinishKit }) {
  const { box } = kit;
  const courts = [
    { id: 'construction', x: 0, z: -1, width: 14, depth: 9, role: 'paving-worksite' },
    { id: 'market', x: 55, z: 27, width: 20, depth: 15, role: 'paving-market' },
    { id: 'residential', x: -54, z: -20, width: 22, depth: 20, role: 'paving-residential' },
    { id: 'depot', x: 0, z: 44, width: 34, depth: 14, role: 'paving-depot' },
    { id: 'utility', x: 0, z: -45, width: 34, depth: 13, role: 'paving-utility' },
  ];
  for (const court of courts) {
    // A 6 mm surface layer changes no support height or collision. The 3 mm
    // separation between layers avoids sharing the street's coplanar top face.
    box(`${court.id}:paving`, court.role, [court.x, .006, court.z], [court.width, .003, court.depth]);
    for (const side of [-1, 1]) {
      box(`${court.id}:gutter:${side}`, 'structure', [court.x + side * (court.width - .35), .014, court.z], [.18, .002, court.depth - .3]);
      box(`${court.id}:kerb:${side}`, 'paving-edge', [court.x + side * (court.width - .65), .014, court.z], [.08, .002, court.depth - .3]);
    }
    // Few widely spaced expansion cuts establish scale without a tiled noise field.
    for (const side of [-1, 1]) box(`${court.id}:joint:${side}`, 'paving-joint', [court.x + side * court.width * .48, .014, court.z], [.018, .002, court.depth - .8]);
  }
  // Construction patches, worn delivery tracks and a repaired utility trench
  // have different shapes and causes. They stay out of the main road lanes.
  box('construction:repair', 'paving-edge', [-4, .014, -3], [3.5, .002, 2]);
  box('construction:repair-seam', 'paving-joint', [-.45, .022, -3], [.025, .002, 2]);
  for (const x of [62, 64]) box(`market:delivery-track:${x}`, 'paving-joint', [x, .014, 30], [.15, .002, 6]);
  box('utility:service-trench', 'structure', [21, .014, -44], [.65, .002, 9]);
  for (const z of [-50, -47, -44, -41, -38]) box(`utility:trench-joint:${z}`, 'paving-edge', [21, .022, z], [.65, .002, .025]);
  // Boarding thresholds lead to the waiting district rather than colouring all edges.
  for (const x of [-25, -22, -19, 19, 22, 25]) box(`depot:threshold:${x}`, 'paving-edge', [x, .022, 30.6], [.85, .002, .16]);
}
