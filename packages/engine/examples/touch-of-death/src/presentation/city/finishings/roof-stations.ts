import type { CityFinishKit } from './kit.ts';

/** Five different working fixtures replace the same empty box at every roof start. */
export function authorRoofStations({ kit }: { kit: CityFinishKit }) {
  const { box } = kit;
  const station = (name: string) => `tod:city:neighborhood:station:${name}`;
  const construction = station('construction-scaffold-landing');
  box('roof:construction:plan', 'paper', [-.12, .85, -.5], [1.03, .36, .035], construction);
  box('roof:construction:plan-grid', 'paving-joint', [-.36, .85, -.456], [.025, .27, .006], construction);
  box('roof:construction:plan-cross', 'paving-joint', [-.1, .9, -.443], [.77, .025, .006], construction);
  for (const x of [.87, 1.05, 1.23]) box(`roof:construction:offcut:${x}`, 'public-paint', [x, .54, .03], [.055, .06, .38], construction);

  const market = station('market-service-counter');
  const recess = kit.entities.get('tod:city:overhaul:market:furniture:market-service-counter:serving-recess');
  if (recess) recess.materialId = kit.materialFor('canvas', market);
  for (const x of [-.85, .85]) box(`roof:market:crate-strap:${x}`, 'structure', [x, -.05, .607], [.045, .31, .02], market);
  box('roof:market:delivery-lid', 'canvas', [0, .72, -.5], [1.2, .23, .035], market);
  box('roof:market:delivery-label', 'paper', [.5, .72, -.456], [.25, .15, .006], market);
  box('roof:market:covered-bin', 'canvas-stripe', [1.05, .64, .1], [.22, .16, .3], market);

  const residential = station('residential-exercise-corner');
  const owner = kit.entities.get(residential)!;
  const weights = kit.entities.get(`${residential}:weights`);
  if (weights) { weights.position = [owner.position[0], owner.position[1], owner.position[2] + .6];weights.scale = [.73, .035, .035]; }
  for (const side of [-1, 1]) {
    const plate = box(`roof:residential:weight-plate:${side}`, 'steel', [side * .7, 0, .62], [.25, .25, .04], residential);
    plate.meshId = 'tod:sphere';
    box(`roof:residential:backrest-post:${side}`, 'structure', [side * .85, .85, -.51], [.055, .39, .045], residential);
  }
  box('roof:residential:backrest', 'residential', [0, .95, -.51], [.72, .28, .05], residential);
  box('roof:residential:towel-top', 'canvas', [1.1, .494, 0], [.21, .014, .33], residential);
  box('roof:residential:towel-hanging', 'canvas', [1.325, .24, 0], [.014, .25, .33], residential);

  const depot = station('depot-lost-property-shelf');
  for (const side of [-1, 1]) {
    const wheel = kit.entities.get(`tod:city:overhaul:depot:furniture:depot-lost-property-shelf:cart-wheel:${side * .98}`);
    if (wheel) wheel.meshId = 'tod:sphere';
    box(`roof:depot:push-handle:${side}`, 'steel', [side * 1.18, .85, -.5], [.055, .39, .055], depot);
  }
  box('roof:depot:push-bar', 'paving-edge', [0, 1.22, -.5], [1.23, .055, .055], depot);
  box('roof:depot:service-panel', 'structure', [0, -.05, .578], [.71, .28, .016], depot);
  box('roof:depot:service-slot', 'paving-edge', [0, .09, .604], [.4, .025, .008], depot);

  const utility = station('utility-service-bench');
  box('roof:utility:rack-back', 'window', [0, .95, -.54], [1.12, .45, .018], utility);
  for (const side of [-1, 1]) box(`roof:utility:rack-post:${side}`, 'steel', [side * 1.2, .95, -.5], [.06, .51, .06], utility);
  box('roof:utility:rack-crossbar', 'paving-edge', [0, 1.46, -.5], [1.26, .055, .06], utility);
  for (const x of [-.7, 0, .7]) box(`roof:utility:rack-clasp:${x}`, 'paving-edge', [x, .65, -.51], [.035, .12, .03], utility);
}
