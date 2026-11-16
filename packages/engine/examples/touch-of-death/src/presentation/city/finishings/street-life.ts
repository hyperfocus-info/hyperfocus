import type { CityFinishKit } from './kit.ts';

/** Human-scale activity must occupy the counters and windows seen during fights. */
export function authorStreetLife({ kit }: { kit: CityFinishKit }) {
  const { box } = kit;
  for (const index of [0, 1]) {
    const counter = `tod:city:overhaul:market:street-stall:${index}:counter`;
    const canopy = `tod:city:overhaul:market:street-stall:${index}:canopy`;
    // Produce is contained in fitted shallow trays; loose usable items keep the
    // inventory's highlight and interaction rules instead of becoming fake stock.
    for (const side of [-1, 1]) {
      box(`market:street:${index}:tray:${side}`, 'rust', [side * .73, .635, 0], [.48, .055, .35], counter);
      for (const [fruit, x] of [-.25, 0, .25].entries()) {
        const piece = box(`market:street:${index}:produce:${side}:${fruit}`, side < 0 ? 'produce-green' : 'produce-ochre',
          [side * .73 + x, .76, fruit === 1 ? .09 : -.09], [.16, .15, .17], counter);
        piece.meshId = 'tod:sphere';
      }
    }
    const menu = kit.entities.get(`tod:city:overhaul:market:street-stall:${index}:menu`)!;
    menu.scale = [.74, .36, .04];
    const line = kit.entities.get(`tod:city:overhaul:market:street-stall:${index}:menu-line`)!;
    line.scale = [.18, .027, .012];
    // A large painted 3 or 5 reads as a price from the fight camera, rather than
    // another empty dark rectangle. Existing menu line supplies its middle bar.
    for (const y of [-.42, -1.02]) box(`market:street:${index}:price-bar:${y}`, 'paper', [0, y, -.93], [.18, .026, .012], canopy);
    for (const upper of [false, true]) box(`market:street:${index}:price-stem:${upper}`, 'paper',
      [index && upper ? -.2 : .2, upper ? -.55 : -.86, -.93], [.026, .14, .012], canopy);
    box(`market:street:${index}:lamp`, 'domestic-glass', [1.1, -.35, -.96], [.1, .065, .08], canopy);
  }
  for (const index of [0, 1]) {
    const wall = `tod:city:overhaul:residential:entrance:${index}:wall`;
    for (const window of ['window', 'upper-window']) {
      const pane = kit.entities.get(`tod:city:overhaul:residential:entrance:${index}:${window}`)!;
      pane.materialId = kit.materialFor('domestic-glass', wall);
    }
    for (const side of [-1, 1]) box(`residential:porch:${index}:curtain:${side}`, 'canvas', [side * .62, 1.7, .284], [.14, .48, .018], wall);
    box(`residential:porch:${index}:doormat`, 'rust', [-.75, -2.778, .94], [.7, .012, .42], wall);
    box(`residential:porch:${index}:mailbox`, 'paving-edge', [1.28, -1.22, .32], [.18, .24, .065], wall);
    box(`residential:porch:${index}:mail-slot`, 'structure', [1.28, -1.13, .39], [.12, .018, .008], wall);
  }
  // The north balconies, unlike the west block, face the normal rooftop camera.
  for (const floor of [1, 2]) for (const side of [-1, 1]) {
    const rail = `tod:city:overhaul:residential:north:rail:${floor}`;
    box(`residential:north:laundry:${floor}:${side}`, side < 0 ? 'canvas' : 'residential', [side * 3.4, -.04, .075], [.65, .38, .028], rail);
  }
  const roof = 'tod:city:overhaul:depot:boarding:shelter-roof';
  for (const [route, x] of [-2, 0, 2].entries()) {
    const mark = kit.entities.get(`tod:city:overhaul:depot:boarding:route-mark:${x}`)!;
    mark.scale = [.18, .026, .015];
    // Reuse the middle strokes; three large route-4 numerals replace generic bars.
    for (const side of [-1, 1]) box(`depot:route:${route}:upper:${side}`, 'paper', [x + side * .2, -.05, 1.28], [.026, .16, .015], roof);
    box(`depot:route:${route}:lower`, 'paper', [x + .2, -.35, 1.28], [.026, .14, .015], roof);
  }
  const post = 'tod:city:overhaul:depot:boarding:post:1';
  box('depot:timetable:board', 'paper', [-.25, .5, 1.1], [.46, .7, .045], post);
  box('depot:timetable:route', 'transit', [-.47, .5, 1.153], [.025, .48, .006], post);
  for (const [index, y] of [-.36, 0, .36].entries()) {
    box(`depot:timetable:stop:${index}`, 'structure', [-.47, .5 + y, 1.166], [.075, .06, .006], post);
    box(`depot:timetable:time:${index}`, 'structure', [-.1, .5 + y, 1.153], [.17, .028, .006], post);
  }
  const island = 'tod:city:overhaul:depot:boarding:service-island';
  // Recessed compartment fronts and divided upholstery describe a transit
  // waiting island without adding an uncollidable freestanding furniture prop.
  for (const x of [-1.1, 0, 1.1]) {
    box(`depot:boarding:seat:${x}`, 'transit', [x, .35, 0], [.48, .02, .32], island);
    box(`depot:boarding:seat-back:${x}`, 'transit', [x, .8, -.29], [.48, .3, .045], island);
  }
  for (const x of [-.55, .55]) box(`depot:boarding:divider:${x}`, 'paving-edge', [x, .4, 0], [.025, .07, .32], island);
  for (const side of [-1, 1]) {
    box(`depot:boarding:compartment:${side}`, 'structure', [side * .82, -.03, .36], [.65, .18, .012], island);
    box(`depot:boarding:compartment-slot:${side}`, 'paving-edge', [side * .82, .05, .381], [.2, .025, .008], island);
    box(`depot:boarding:back-support:${side}`, 'steel', [side * 1.45, .55, -.32], [.045, .25, .04], island);
  }
}
