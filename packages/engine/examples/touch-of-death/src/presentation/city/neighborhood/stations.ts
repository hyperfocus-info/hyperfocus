/** Arena-owned furniture locations. Inventory owns which of these slots are stocked. */
export const cityStationTemplates = [
  { id: 'construction-material-stack', district: 'construction', role: 'contested', center: [0, .15, 10] },
  { id: 'construction-workbench', district: 'construction', role: 'street', center: [10, .15, 10] },
  { id: 'construction-scaffold-landing', district: 'construction', role: 'roof', center: [0, 6.15, -4.1] },
  { id: 'residential-doorstep-table', district: 'residential', role: 'street', center: [-50, .15, -14] },
  { id: 'residential-maintenance-shelf', district: 'residential', role: 'street', center: [-43, .15, -33] },
  { id: 'residential-exercise-corner', district: 'residential', role: 'roof', center: [-52.5, 6.15, -20] },
  { id: 'market-preparation-counter', district: 'market', role: 'street', center: [50, .15, 22] },
  { id: 'market-delivery-crates', district: 'market', role: 'street', center: [63, .15, 6] },
  { id: 'market-service-counter', district: 'market', role: 'roof', center: [47.5, 6.15, 16] },
  { id: 'depot-loading-bench', district: 'depot', role: 'street', center: [0, .15, 46] },
  { id: 'depot-service-cart', district: 'depot', role: 'street', center: [20, .15, 50] },
  { id: 'depot-lost-property-shelf', district: 'depot', role: 'roof', center: [-2.5, 6.15, 40] },
  { id: 'utility-maintenance-station', district: 'utility', role: 'street', center: [0, .15, -38] },
  { id: 'utility-equipment-rack', district: 'utility', role: 'exposed', center: [18, .15, -48] },
  { id: 'utility-service-bench', district: 'utility', role: 'roof', center: [-2.5, 6.15, -44] },
] as const;

export type CityStationId = typeof cityStationTemplates[number]['id'];

/** Furniture frames a stock pocket; roof stations first try a shared rear edge. */
export function cityStationCandidates({ index, seed = 0 }: { index: number; seed?: number }) {
  const station = cityStationTemplates[index];
  if (!station) throw new Error(`Unknown city station ${index}.`);
  const variant = ((Math.trunc(seed) >>> 0) + index * 7) % 3;
  const offsets = [[0, 2], [3.3, 0], [-3.3, 0], [3.3, 2], [-3.3, 2], [0, 3.3], [-4.2, -1.2], [4.2, -1.2]] as const;
  const candidates = offsets.map((_, index): [number, number, number] => {
    const offset = offsets[(index + variant) % offsets.length]!;
    return [station.center[0] + offset[0], station.center[1] + .3, station.center[2] + offset[1]];
  });
  // A near-roof shelf must not become a free long-lived tool behind one start.
  // The rear center can span joined slabs; side pockets remain fallbacks when
  // an authored obstruction or custom inventory makes that location unavailable.
  if (station.role === 'roof') candidates.unshift([station.center[0], station.center[1] + .3, station.center[2] - 1.2]);
  return candidates;
}
