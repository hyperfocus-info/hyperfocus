import type { CityFinishKit } from './kit.ts';

/** A privileged dark observation bay sits above the blue utilitarian study floor. */
export function authorOversight({ kit }: { kit: CityFinishKit }) {
  const { box } = kit;
  const roof = 'tod:city:overhaul:utility:gallery:roof';
  box('oversight:window', 'window', [4.55, -.69, 2.8], [2.75, .35, .045], roof);
  for (const y of [-1.055, -.325]) box(`oversight:brass-frame:${y}`, 'oversight-brass', [4.55, y, 2.85], [2.8, .018, .025], roof);
  for (const x of [3.1, 4.5]) {
    box(`oversight:operator:${x}:head`, 'paving-edge', [x, -.56, 2.875], [.09, .1, .045], roof);
    box(`oversight:operator:${x}:shoulders`, 'steel', [x, -.78, 2.875], [.19, .12, .055], roof);
    box(`oversight:operator:${x}:console`, 'test-blue', [x, -.95, 2.96], [.4, .035, .13], roof);
  }
  for (const [index, width] of [.23, .16, .08].entries()) box(`oversight:crest:${index}`, 'oversight-brass', [6.65, -.5 - index * .17, 2.866], [width, .045, .012], roof);

  const control = 'tod:city:overhaul:utility:control-gate:switchgear';
  // Large pressure instrumentation belongs to the actual street-facing machine,
  // not another decorative poster on a distant wall.
  for (const side of [-1, 1]) {
    const dial = box(`utility:pressure:${side}`, 'paving-edge', [side * .46, .3, .478], [.19, .19, .024], control);
    dial.meshId = 'tod:sphere';
    box(`utility:pressure-needle:${side}`, 'structure', [side * .46 + .05, .33, .51], [.085, .018, .006], control);
  }
  box('utility:schematic-feed', 'test-blue', [0, .32, .479], [.022, .22, .014], control);
  box('utility:schematic-branches', 'test-blue', [0, .08, .479], [.7, .022, .014], control);
}
