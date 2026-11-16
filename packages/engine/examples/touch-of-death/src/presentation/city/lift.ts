import type { Hyperfocus3DDeclaration } from '@hyperfocus/engine/project/runtime-3d';

type Scene = Hyperfocus3DDeclaration['scenes'][number];
type Vec3 = [number, number, number];
type Box = (id: string, material: string, position: Vec3, scale: Vec3, solid?: boolean) => Scene['entities'][number];

/** A continuously cycling worksite lift exposes the engine's ordinary moving support rules. */
export function authorCityLift(options: { box: Box }) {
  const { box } = options;
  // The lower stop clears a standing fighter beneath it; boarding uses the
  // existing jump instead of an unsupported crushing/ejection rule.
  const deck = box('freight-lift', 'steel', [10, 2.2, 1.8], [2.2, .2, 2.2]);
  deck.animation = { kind: 'ping-pong', offset: [0, 3.7, 0], periodSeconds: 10, phase: 0 };
  const ride = (id: string, material: string, position: Vec3, scale: Vec3) => {
    const piece = box(`detail:lift:${id}`, material, [position[0], position[1] + 2.4, position[2]], scale, false);
    piece.animation = structuredClone(deck.animation);
  };
  for (const x of [7.87, 12.13]) ride(`edge-x:${x}`, 'warning', [x, .012, 1.8], [.06, .012, 2.13]);
  for (const z of [-.33, 3.93]) ride(`edge-z:${z}`, 'warning', [10, .012, z], [2.13, .012, .06]);
  for (let i = 0; i < 7; i++) ride(`tread:${i}`, 'concrete-dark', [10, .01, -.05 + i * .62], [1.8, .01, .025]);
  for (const z of [-.6, 4.2]) {
    box(`architecture:lift-guide:${z}`, 'steel', [12.45, 3.6, z], [.1, 3.6, .1], false);
    box(`architecture:lift-guide-base:${z}`, 'warning', [12.45, .16, z], [.28, .16, .28], false);
    ride(`carriage:${z}`, 'warning', [12.45, .2, z], [.2, .32, .2]);
  }
  box('architecture:lift-motor', 'steel', [12.45, 7.15, 1.8], [.42, .35, .7], false);
  box('architecture:lift-drive', 'rust', [12.45, 7.15, 1.8], [.065, .065, 2.4], false);
  box('architecture:lift-power-lamp', 'lamp', [12, 7.15, 1.8], [.04, .08, .16], false);
}
