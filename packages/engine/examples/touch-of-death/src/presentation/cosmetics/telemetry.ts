import type { ArtFixture } from '../art-direction/fixture.ts';
import type { Hyperfocus3DEvaluatedFrame } from '@hyperfocus/engine/project/runtime-3d';
import { cookCityFacets } from '../city/mesh-cooking.ts';
import { block, move, transform, vessel } from '../city/weapons/geometry.ts';

/** Arena-issued measurement hardware. These are status lamps, never projected energy. */
export function addTelemetryEquipment(fixture: ArtFixture, id: string) {
  const components = {
    housing: { material: 'cosmetic-sensor-case', faces: [
      ...block(-.12, 1.48, .172, .055, .072, .026, .2),
      ...block(0, 1.45, -.172, .095, .14, .035, .2),
    ] },
    mounting: { material: 'cosmetic-sensor-strap', faces: [
      ...block(-.12, 1.48, .151, .066, .092, .009, .15),
      ...block(0, 1.45, -.149, .112, .159, .009, .15),
    ] },
    status: { material: `cosmetic-sensor-light-${id}`, faces: [
      ...block(-.12, 1.525, .204, .020, .004, .002, .1),
      ...block(.045, 1.53, -.214, .019, .004, .002, .1),
    ] },
    faceplate: {material:'cosmetic-sensor-face',faces:[
      ...block(-.12,1.476,.201,.044,.052,.002,.18),
      ...block(0,1.45,-.209,.081,.117,.002,.12),
      // Recessed cable exit and a short, shielded strain relief behind the mount.
      ...block(-.12,1.408,.163,.019,.011,.017,.25),
      ...block(0,1.304,-.162,.024,.016,.016,.25),
    ]},
    optics:{material:'cosmetic-sensor-optics',faces:[
      ...move(transform(vessel([[-.002,.020],[.001,.020],[.003,.016]],1,12),1,1,1,1.5707963267948966),-.12,1.484,.208),
      ...[-1,0,1].flatMap(row=>block(-.025,1.42+row*.015,-.213,.038,.003,.002,.1)),
    ]},
    fasteners:{material:'cosmetic-sensor-fastener',faces:[
      ...[-1,1].flatMap(side=>[-1,1].flatMap(row=>block(-.12+side*.040,1.48+row*.061,.204,.003,.003,.002,.4))),
      ...[-1,1].flatMap(side=>[-1,1].flatMap(row=>block(side*.075,1.45+row*.104,-.214,.004,.004,.002,.4))),
      ...block(-.135,1.443,.207,.013,.006,.001,.1),
      ...block(.039,1.375,-.214,.027,.008,.001,.1),
    ]},
  };
  for (const [part, { material, faces }] of Object.entries(components)) {
    const model = fixture.model(`${id}:telemetry-${part}-model`, cookCityFacets(`Telemetry ${part}`, faces));
    fixture.add(`${id}:telemetry-${part}`, model, material, [0, 0, 0]);
  }
  if (!fixture.declaration.materials.some(material => material.id === 'cosmetic-sensor-case')) {
    fixture.declaration.materials.push(
      { id: 'cosmetic-sensor-case', shading: 'lit', baseColor: [.10, .145, .16, 1], roughness: .6, metallic: .3, doubleSided: false },
      { id: 'cosmetic-sensor-strap', shading: 'lit', baseColor: [.065, .08, .085, 1], roughness: .93, metallic: 0, doubleSided: false },
      { id: 'cosmetic-sensor-face', shading: 'lit', baseColor: [.20,.25,.26,1], roughness: .72, metallic: .22, doubleSided: false },
      { id: 'cosmetic-sensor-optics', shading: 'lit', baseColor: [.032,.075,.095,1], roughness: .28, metallic: .12, doubleSided: false },
      { id: 'cosmetic-sensor-fastener', shading: 'lit', baseColor: [.43,.45,.42,1], roughness: .68, metallic: .35, doubleSided: false },
    );
  }
  fixture.declaration.materials.push({ id: `cosmetic-sensor-light-${id}`, shading: 'lit', baseColor: [.22, .365, .447, 1], emissive: [.07, .14, .18], roughness: .38, metallic: 0, doubleSided: false });
}

export function presentTelemetry(frame: Hyperfocus3DEvaluatedFrame, actorId: string, enabled: boolean, pulse: number, reducedMotion: boolean) {
  const worn = frame.entities.find(entity => entity.id === actorId)?.variantId === 'relay';
  for (const entity of frame.entities) if (entity.id.startsWith(`${actorId}:art:telemetry-`)) entity.visible = worn || enabled;
  // Per-fighter material overrides avoid making the opponent's lamps pulse too.
  const lamp = frame.materials?.find(material => material.id === `tod:directed:cosmetic-sensor-light-${actorId}`);
  if (lamp) {
    const strength = !reducedMotion && enabled ? Math.max(0, Math.min(1, pulse)) : 0;
    lamp.look = { ...lamp.look, emissive: [.07 + strength * .18, .14 + strength * .30, .18 + strength * .37] };
  }
}
