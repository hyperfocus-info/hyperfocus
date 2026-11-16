import type { CityFinishKit } from './kit.ts';

/** Civilian spaces conceal repeated inspection hardware and matching human studies. */
export function authorInstitutionalFinishes({ kit }: { kit: CityFinishKit }) {
  const { box } = kit;
  const rear = 'tod:city:overhaul:utility:gallery:rear';
  const gallery = 'tod:city:overhaul:utility:gallery:floor';
  for (const x of [-5.8, -1.9, 2]) {
    const pane = kit.entities.get(`tod:city:overhaul:utility:gallery:window:${x}`)!;
    pane.materialId = kit.materialFor('observation-glass', gallery);
    const screen = kit.entities.get(`tod:city:overhaul:utility:gallery:monitor:${x}`)!;
    screen.scale = [1.35, 1.15, .03];
  }
  // Normal-camera review showed that the old tiny diagrams were hidden behind
  // opaque glazing. Three repeated human studies now occupy those actual bays.
  for (const [index, x] of [-5.8, -1.9, 2].entries()) {
    const id = `utility:study:${index}`;
    box(`${id}:head`, 'active-blue', [x, .75, .27], [.18, .18, .007], rear);
    box(`${id}:body`, 'active-blue', [x, .1, .27], [.29, .34, .007], rear);
    box(`${id}:body-scan`, 'test-blue', [x, .1, .287], [.2, .27, .006], rear);
    box(`${id}:scan-line`, 'active-blue', [x, .02, .303], [.68, .015, .006], rear);
    for (const side of [-1, 1]) {
      box(`${id}:arm:${side}`, 'active-blue', [x + side * .4, .07, .27], [.09, .37, .007], rear);
      box(`${id}:leg:${side}`, 'active-blue', [x + side * .16, -.61, .27], [.105, .36, .007], rear);
    }
    box(`${id}:comparison`, 'test-blue', [x + .95, 0, .27], [.025, .8, .007], rear);
    for (const y of [-.65, -.05, .55]) box(`${id}:sample:${y}`, 'test-blue', [x + 1.13, y, .27], [.12, .012, .007], rear);
  }
  // Deliberately identical replacement patches and fasteners recur across walls.
  // Wear has been repaired by the same facility, rather than randomly weathered.
  for (const [district, part, x, y, z] of [
    ['market', 'hall:1:back', 1.8, -2.7, .573],
    ['residential', 'entrance:1:wall', 1, -.9, .285],
    ['utility', 'gallery:rear', 6.8, -.7, .215],
  ] as const) {
    const owner = `tod:city:overhaul:${district}:${part}`;
    box(`${district}:replacement-panel`, 'paving-edge', [x, y, z], [.4, .52, .01], owner);
  }
}
