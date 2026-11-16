import type { DirectedFamily } from '../../../city/weapons/direction/grammar.ts';
import type { WeaponIntent } from '../../../city/weapons/direction/intent.ts';
import type { Point } from '../curves.ts';

export type Stroke = { coil: Point; contact: Point; finish: Point; axes: [Point, Point, Point]; crouch: number; turn: number; lean: number };
// Axis triples are yaw/elevation/unused: interpolate angles along an authored arc,
// rather than mixing opposite vectors through a zero-length tool orientation.
const stroke = (coil: Point, contact: Point, finish: Point, axes: [Point, Point, Point], crouch = .05, turn = .45, lean = .12): Stroke => ({ coil, contact, finish, axes, crouch, turn, lean });

/** Named paths have distinct load, contact and exit silhouettes before family adaptation. */
export function weaponStroke(family: DirectedFamily, intent: WeaponIntent, heavy: boolean): Stroke {
  const paths: Record<WeaponIntent, Stroke> = {
    check: stroke([.43, 1.46, .12], [.05, 1.39, .59], [-.17, 1.19, .42], [[.8, 1.1, 0], [0, .05, 0], [-1.1, -.3, 0]]),
    lunge: stroke([.30, 1.20, .06], [.08, 1.28, .78], [.08, 1.20, .67], [[.25, .2, 0], [0, 0, 0], [-.15, -.1, 0]], .065, .28, .22),
    withdraw: stroke([.10, 1.32, .40], [.28, 1.46, .51], [.42, 1.54, .12], [[-1.1, .1, 0], [.15, .15, 0], [1.2, .8, 0]], .035, -.36, -.15),
    return: stroke([-.12, 1.15, .31], [.14, 1.45, .58], [.45, 1.53, .24], [[-1.1, -.35, 0], [.1, .1, 0], [1.1, .7, 0]], .06, -.55),
    pressure: stroke([.40, 1.43, .10], [.04, 1.39, .59], [-.19, 1.24, .37], [[.8, .7, 0], [0, .05, 0], [-1.1, -.3, 0]], .07, .55),
    body: stroke([.39, 1.02, .04], [.05, 1.05, .65], [-.16, .99, .38], [[.8, .15, 0], [0, -.18, 0], [-1.1, -.25, 0]], .12, .65, .21),
    'anti-air': stroke([.30, .91, .10], [.08, 1.53, .56], [.10, 1.72, .33], [[.6, -.7, 0], [0, .55, 0], [-.25, 1.05, 0]], .14, .65, .04),
    counter: stroke([.43, 1.40, -.02], [.07, 1.43, .66], [-.12, 1.19, .44], [[1.3, .5, 0], [0, .1, 0], [-1.2, -.25, 0]], .10, .8, .14),
    overhead: stroke([.23, 1.74, -.02], [.09, 1.13, .68], [.12, .87, .42], [[.1, 2.1, 0], [0, -.14, 0], [-.2, -.95, 0]], .18, .32, .30),
    sweep: stroke([.43, 1.08, -.03], [.06, 1.14, .59], [-.20, 1.20, .29], [[1.4, -.15, 0], [0, -.1, 0], [-1.6, .1, 0]], .10, .95, .16),
    evade: stroke([.15, 1.45, .22], [.10, 1.46, .23], [.19, 1.41, .28], [[-.4, .8, 0], [-.3, .9, 0], [.2, 1, 0]], .045, -.25, -.16),
    'rising-entry': stroke([.30, .98, .04], [.11, 1.58, .67], [.18, 1.71, .37], [[.8, -.6, 0], [.1, .6, 0], [-.1, 1.1, 0]], .12, .6, .15),
  };
  const p = paths[intent];
  if (family === 'piercing') {
    p.coil = [.30, intent === 'body' ? 1.13 : 1.32, .15];
    p.finish = [.27, p.contact[1], .30];
    p.axes = [[.05, .1, 0], [0, intent === 'anti-air' ? .7 : intent === 'overhead' ? -.8 : 0, 0], [.12, .15, 0]];
    p.turn *= .55; p.crouch *= .65;
    if (intent === 'check') { p.contact = [.27, 1.32, .54]; p.finish = [.28, 1.28, .23]; }
    if (intent === 'lunge' && heavy) { p.coil = [.32, 1.03, .08]; p.contact = [.04, 1.12, .85]; p.finish = [.19, 1.06, .40]; p.crouch = .12; p.lean = .25; }
    if (intent === 'counter') { p.coil = [.15, 1.56, .10]; p.contact = [.12, 1.17, .65]; p.finish = [.35, 1.09, .37]; p.axes = [[.4, 1.3, 0], [0, -.3, 0], [.3, -.4, 0]]; }
  }
  if (family === 'long') {
    p.coil[0] = .20; p.contact[0] = .06; p.finish[0] = -.10;
    if (intent === 'check' || intent === 'lunge') {
      p.coil = [.18, 1.16, .02]; p.contact = [.08, 1.19, intent === 'lunge' ? .71 : .54]; p.finish = [.11, 1.12, .50];
      p.axes = [[-.2, .1, 0], [0, .03, 0], [-.2, -.05, 0]];
    }
    if (intent === 'return' || intent === 'withdraw') {
      p.coil = [.18, 1.15, .28]; p.contact = [.08, 1.23, .53]; p.finish = [.25, 1.15, .20];
      p.axes = [[2.3, .15, 0], [Math.PI, .1, 0], [3.8, .25, 0]];
    }
    if (intent === 'lunge' && heavy) { p.coil = [.15, .97, .06]; p.contact = [.02, 1.27, .78]; p.finish = [.04, 1.36, .50]; p.axes = [[-.45, -.3, 0], [0, .3, 0], [.3, .35, 0]]; p.crouch = .19; p.turn = .5; }
    p.turn *= .75; p.crouch += .025;
  }
  if (family === 'blunt' || family === 'heavy') {
    if (heavy) { p.crouch += .09; p.turn *= 1.25; p.lean += .07; p.coil[2] -= .08; }
    if (!heavy && intent === 'check') {
      p.coil = [.37, 1.20, .12]; p.contact = [.20, 1.27, .56]; p.finish = [.04, 1.20, .40];
      p.axes = [[.9, .1, 0], [0, .1, 0], [-.65, -.1, 0]];
    }
    if (heavy && intent === 'counter') {
      p.coil = [.37, 1.66, -.08]; p.contact[1] = 1.20; p.finish = [-.13, .97, .42];
      p.axes = [[.8, 1.9, 0], [0, -.1, 0], [-.6, -.7, 0]];
    }
    if (heavy && intent === 'lunge') { p.coil = [.43, 1.21, -.05]; p.contact = [.08, 1.10, .72]; p.finish = [-.21, 1.05, .47]; p.axes = [[1.7, .25, 0], [0, 0, 0], [-1.6, -.2, 0]]; p.turn = .9; p.lean = .27; }
    if (family === 'heavy') { p.coil[0] = .16; p.contact[0] = .07; p.finish[0] = .03; }
  }
  return p;
}
