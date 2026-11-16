type Vec3 = [number, number, number];
type Add = (id: string, material: string, position: Vec3, scale: Vec3, solid?: boolean, owner?: string) => { id: string };

/** A closed rooftop circuit, with street alternatives under each bridge. */
export function authorNeighborhoodRoutes({ add, seed = 0 }: { add: Add; seed?: number }) {
  const depotCrossing = (Math.trunc(seed) >>> 0) % 2 ? 44 : 34;
  const routes = [
    { id: 'worksite-market', from: [6, -4], to: [40.8, -4], position: [23.4, 5.8, -4], scale: [17.4, .2, 1.4] },
    // The inside edge leaves headroom over the east stair's full two-seat width.
    { id: 'market-turn', from: [40.8, -4], to: [40.8, 14], position: [40.8, 5.8, 5], scale: [1.4, .2, 10.4] },
    { id: 'market-depot', from: [42, 18], to: [42, 44], position: [42, 5.8, 31], scale: [1.4, .2, 14.4] },
    { id: 'depot-turn', from: [42, depotCrossing], to: [4, depotCrossing], position: [23, 5.8, depotCrossing], scale: [19, .2, 1.4] },
    { id: 'depot-worksite', from: [-3, 34], to: [-3, 4], position: [-3, 5.8, 19], scale: [1.4, .2, 15] },
  ];
  add('route:depot-rear-landing', 'steel', [2, 5.8, 42.5], [2, .2, 2.5], true);
  for (const route of routes) {
    const position: Vec3 = [route.position[0]!, route.position[1]!, route.position[2]!];
    const scale: Vec3 = [route.scale[0]!, route.scale[1]!, route.scale[2]!];
    const deck = add(`route:${route.id}`, 'steel', position, scale, true);
    const alongX = scale[0] > scale[2];
    for (const side of [-1, 1]) add(`route:${route.id}:edge:${side}`, 'warning',
      [position[0] + (alongX ? 0 : side * 1.32), 6.015, position[2] + (alongX ? side * 1.32 : 0)],
      alongX ? [scale[0], .015, .06] : [.06, .015, scale[2]], false, deck.id);
    // Exposed trusses carry the bridges without putting piers in traffic lanes.
    for (const side of [-1, 1]) add(`route:${route.id}:beam:${side}`, 'concrete-dark',
      [position[0] + (alongX ? 0 : side * 1.2), 5.35, position[2] + (alongX ? side * 1.2 : 0)],
      alongX ? [scale[0], .25, .12] : [.12, .25, scale[2]], false, deck.id);
  }
  // Two-ended market preparation arcade: a covered route between street clusters.
  const canopy = add('market:canopy', 'concrete', [46, 3.5, 24], [6, .18, 2.6], true);
  for (const side of [-1, 1]) {
    const wall = add(`market:service-wall:${side}`, 'plaster', [46, 1.65, 24 + side * 2.8], [3, 1.65, .15], true);
    add(`market:awning:${side}`, 'warning', [46, 3.3, 24 + side * 2.65], [6, .12, .12], false, canopy.id);
    add(`market:counter-light:${side}`, 'lamp', [46, 2.6, 24 + side * 2.62], [1.2, .04, .04], false, wall.id);
  }
  // Residential maintenance annex opens to the existing apartment and the street.
  const annex = add('residential:annex-roof', 'concrete', [-42.5, 3.5, -15], [3, .18, 3], true);
  add('residential:service-wall', 'plaster', [-39.5, 1.65, -16.8], [.15, 1.65, 2.2], true);
  add('residential:lintel', 'steel', [-39.5, 3.15, -13], [.15, .17, 1.5], false, annex.id);
  // Repeated blue observation slits betray one owner behind the civilian modules.
  for (const [district, x, z] of [['market', 46, 26.61], ['residential', -39.67, -16.8], ['utility', 2, -49.68]] as const) {
    const sideways = district === 'residential';
    const owner = district === 'utility' ? 'tod:city:expanded:court:3:back-right' : `tod:city:neighborhood:${district}:service-wall${district === 'market' ? ':1' : ''}`;
    add(`${district}:observation-backing`, 'steel', [x, 2.8, z], sideways ? [.06, .16, .65] : [.65, .16, .06], false, owner);
    add(`${district}:observation-slit`, 'window', [x - (sideways ? .07 : 0), 2.8, z - (sideways ? 0 : .07)], sideways ? [.02, .065, .5] : [.5, .065, .02], false, owner);
    add(`${district}:observation-indicator`, 'lamp', [x + (sideways ? -.07 : .58), 2.8, z + (sideways ? .58 : -.07)], [.035, .035, .025], false, owner);
  }
  return routes.map(({ id, from, to }) => ({ id, from, to, height: 6, width: 2.8 }));
}
