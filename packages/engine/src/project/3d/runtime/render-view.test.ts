import { expect, test } from 'bun:test';
import { combatMotionFixture } from "../combat-motion-fixture.ts";
import type { Hyperfocus3DTimeline } from "../../../frame/3d.ts";

test('owned render view matches detached frames across edits, gameplay, resets and presentation writes', async () => {
  const { runtime, game } = await combatMotionFixture();
  const sample = { viewport: { width: 800, height: 600 } }, checkpoint = game.snapshot();
  let created = 0;
  for (let step = 0; step < 12; step++) {
    if (step === 7) game.restore(checkpoint);else if (step % 3) game.step(['a:jab']);
    const expected = runtime.sampleFrame(sample);
    runtime.withRenderView({ sample, operation(frame) {
      expect(frame).toEqual(expected);runtime.applyFrame(frame);
      frame.entities[0]!.visible = false;frame.entities[0]!.renderMaterialId = 'missing';frame.entities[0]!.position = [100, 200, 300];
      frame.materials[0]!.look = { ...frame.materials[0]!.look, opacity: .1, cutaway: true };
    } });
    if (!step) created = runtime.readRenderViewWork().entityRecordsCreated;
  }
  expect(runtime.readRenderViewWork().entityRecordsCreated).toBe(created);
  expect(runtime.readRenderViewWork().materialRecordsCreated).toBe(runtime.declaration.materials.length);
  runtime.declaration.materials[0]!.baseColor[0] = .123;
  runtime.withRenderView({ sample, operation(frame) { expect(frame).toEqual(runtime.sampleFrame(sample)); } });
});

test('borrowed view prevents reentry/async use and still rejects dead material resources', async () => {
  const { runtime } = await combatMotionFixture(), sample = { viewport: { width: 800, height: 600 } };
  expect(() => runtime.withRenderView({ sample, operation: () => runtime.withRenderView({ sample, operation: () => {} }) })).toThrow('reentered');
  expect(() => runtime.withRenderView({ sample, operation: () => Promise.resolve() })).toThrow('synchronous');
  expect(() => runtime.withRenderView({ sample, operation(frame) { frame.entities[0]!.renderMaterialId = 'missing';runtime.applyFrame(frame); } })).toThrow();
  runtime.withRenderView({ sample, operation(frame) { runtime.applyFrame(frame); } });
});

test('timeline editing uses the detached fallback and returning to gameplay restores owned base state', async () => {
  const {runtime}=await combatMotionFixture();
  const timeline:Hyperfocus3DTimeline={version:2,sceneId:runtime.declaration.activeSceneId,durationFrames:120,fps:60,background:'#000',groups:[],materialTracks:[],shots:[],
    entityTracks:[{entityId:'a',keyframes:[{id:'key',frame:0,position:[10,2,3],rotationEuler:[0,0,0],scale:[2,2,2],visible:false,interpolation:'hold'}]}]};
  const viewport={width:800,height:600};
  runtime.withRenderView({sample:{viewport},operation(frame){frame.entities[0]!.visible=false;}});
  runtime.withRenderView({sample:{viewport,timeline},operation(frame){expect(frame).toEqual(runtime.sampleFrame({viewport,timeline}));expect(frame.entities[0]!.position).toEqual([10,2,3]);}});
  expect(runtime.readRenderViewWork().fallbackSamples).toBe(1);
  runtime.withRenderView({sample:{viewport},operation(frame){expect(frame).toEqual(runtime.sampleFrame({viewport}));}});
});
