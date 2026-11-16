import { tuple3 } from "../math/tuples.ts";
import { describe, expect, test } from "bun:test";
import { auditHyperfocus3DProject, createEntityInputLease3D, createGameplay3D, createHyperfocus3DRuntime, isHyperfocus3DSnapshot, readHyperfocus3DDeclaration, sample3DFrame, type Hyperfocus3DTimeline, type PortableAsset3D } from "./runtime-3d.ts";
import { MATERIAL_FLAG_EMISSIVE_TEXTURED_3D, MATERIAL_FLAG_METALLIC_ROUGHNESS_TEXTURED_3D, MATERIAL_FLAG_NORMAL_TEXTURED_3D, MATERIAL_FLAG_OCCLUSION_TEXTURED_3D, MATERIAL_FLAG_SHADER_TOON_3D, MATERIAL_TEXTURE_STRIDE_3D } from "../render/3d-scene.ts";
import { compilePhysicalPerformance3D } from "../physics/physical-performance-3d.ts";

describe("portable Hyperfocus 3D runtime", () => {
  test('scene startup needs only reachable binaries while the full project audit remains strict', async () => {
    const { project, assets } = fixture();
    const declaration = project.extensions.hyperfocus3D;
    declaration.meshes.push({ ...declaration.meshes[0], id: 'unused-mesh', assetId: 'optional-gltf' });
    expect(auditHyperfocus3DProject(project, assets).some(diagnostic => diagnostic.message.includes('optional-gltf'))).toBe(true);
    const runtime = await createHyperfocus3DRuntime(project, assets);
    expect(runtime.snapshot().sceneId).toBe(declaration.activeSceneId);
    expect(runtime.declaration.meshes.some(mesh => mesh.id === 'unused-mesh')).toBe(true);
    declaration.scenes[0].entities[0].meshId = 'unused-mesh';
    await expect(createHyperfocus3DRuntime(project, assets)).rejects.toThrow('optional-gltf');
  });
  test('immutable TRS sampling reuses owned frozen vectors with fresh mutable shells and detached defaults', async () => {
    const {project,assets}=fixture(), viewport={width:800,height:600};
    delete project.extensions.hyperfocus3D.scenes[0].entities[1].animation;
    const runtime=await createHyperfocus3DRuntime(project,assets);runtime.acquireEndpointProducer({writableEntityIds:['actor']});
    const sample=(entitySampling:'detached'|'immutable-trs'='immutable-trs')=>runtime.withSampledFrame({sample:{viewport},contract:'declared-entity-writes',entitySampling,operation:frame=>{runtime.applyFrame(frame);return frame;}});
    const detachedA=sample('detached'), detachedB=sample('detached');
    expect(detachedB).toEqual(detachedA);expect(detachedB.entities[1]!.position).not.toBe(detachedA.entities[1]!.position);
    expect(runtime.readEntitySamplingWork()).toMatchObject({samples:1,detachedSamples:1,entityVisits:2,recordAllocations:2,vectorAllocations:6,scalarCopies:12,scalarWrites:20,yawQuaternionComputations:2,trigCalls:4,sourceLookups:3,sourceMapGets:9,cacheReferenceCapacity:0,cacheGenerationBytes:0,eligibleSlots:1,volatileSlots:1});
    const first=sample(), cold={...runtime.readEntitySamplingWork()!};const second=sample(), warm={...runtime.readEntitySamplingWork()!};
    expect(second).toEqual(first);expect(second).not.toBe(first);expect(second.entities).not.toBe(first.entities);expect(second.entities[1]).not.toBe(first.entities[1]);
    for(const key of ['position','rotation','scale'] as const){expect(second.entities[1]![key]).toBe(first.entities[1]![key]);expect(Object.isFrozen(second.entities[1]![key])).toBe(true);expect(second.entities[0]![key]).not.toBe(first.entities[0]![key]);expect(Object.isFrozen(second.entities[0]![key])).toBe(false);}
    expect(cold).toMatchObject({cacheAllocations:1,cacheHits:0,cacheMisses:1,freezes:3,vectorAllocations:6});
    expect(warm).toMatchObject({cacheAllocations:0,cacheHits:1,cacheMisses:0,freezes:0,vectorAllocations:3,vectorReuses:3,scalarCopies:6,scalarWrites:10,yawQuaternionComputations:1,trigCalls:2,sourceLookups:2,sourceMapGets:6,recordAllocations:2,recordReuses:0,cacheSlots:1,retainedVectorArrays:3,retainedScalarValues:10,cacheReferenceCapacity:6,cacheGenerationBytes:32,frameReferences:0});
    expect(()=>{first.entities[1]!.position[0]=99;}).toThrow();
    first.entities[1]!.visible=false;first.entities[1]!.variantId='external';first.entities[1]!.renderMaterialId='external';first.entities[1]!.position=[7,8,9];
    const third=sample();expect(third.entities[1]).toEqual(second.entities[1]);expect(third.entities[1]!.position[0]).toBe(2);
    const ordinary=runtime.sampleFrame({viewport});ordinary.entities[1]!.position[0]=NaN;expect(()=>runtime.applyFrame(ordinary)).toThrow();
    expect(sample('detached').entities[1]!.position).not.toBe(third.entities[1]!.position);
  });

  test('immutable TRS generations, authored scale and topology never mutate escaped snapshots', async () => {
    const {project,assets}=fixture(),viewport={width:800,height:600};delete project.extensions.hyperfocus3D.scenes[0].entities[1].animation;
    const runtime=await createHyperfocus3DRuntime(project,assets),checkpoint=runtime.checkpoint();runtime.acquireEndpointProducer({writableEntityIds:['actor']});
    const sample=()=>runtime.withSampledFrame({sample:{viewport},entitySampling:'immutable-trs',contract:'declared-entity-writes',operation:frame=>{runtime.applyFrame(frame);return frame;}});
    const first=sample(), saved=structuredClone(first);sample();
    runtime.applyCommands({commands:[{type:'teleport',entityId:'spinner',position:[9,8,7]}]});const moved=sample();
    expect(moved.entities[1]!.position).toEqual([9,8,7]);expect(first).toEqual(saved);expect(runtime.readEntitySamplingWork()!.cacheMisses).toBe(1);
    runtime.applyCommands({commands:[{type:'pose',entityId:'spinner',rotation:[0,0,0,1]}]});sample();
    expect(runtime.readEntitySamplingWork()).toMatchObject({scalarCopies:16,yawQuaternionComputations:1,trigCalls:2});
    const authored=runtime.declaration.scenes[0]!.entities;
    for(const scale of [-0,3]){authored[1]!.scale[0]=scale;const changed=sample();expect(Object.is(changed.entities[1]!.scale[0],scale)).toBe(true);expect(first).toEqual(saved);expect(runtime.readEntitySamplingWork()!.cacheMisses).toBe(1);}
    authored[1]!.scale[0]=1;sample();runtime.advance({actions:['move-right']});sample();expect(runtime.readEntitySamplingWork()!.cacheHits).toBe(1);
    authored.reverse();const swapped=sample();expect(swapped.entities.map(entity=>entity.id)).toEqual(['spinner','actor']);expect(swapped.entities[0]!.position).toEqual([9,8,7]);expect(runtime.readEntitySamplingWork()!.topologyFallbackEntities).toBe(2);expect(runtime.readEntitySamplingWork()!.cacheHits).toBe(0);
    authored.reverse();checkpoint.restore();const reset=sample();expect(reset.entities[1]!.position).toEqual(saved.entities[1]!.position);expect(first).toEqual(saved);expect(runtime.readEntitySamplingWork()).toMatchObject({cacheClears:1,cacheReferencesReleased:3,cacheHits:0,cacheMisses:1});
    const removed=authored.pop()!;expect(sample().entities).toHaveLength(1);expect(runtime.readEntityTrsJournalWork()!.numericReuses).toBe(0);
    authored.push({...removed,id:'unknown'});expect(sample).toThrow('not available');expect(runtime.readEntitySamplingWork()!.cacheSlots).toBe(0);
    authored.pop();authored.push(removed);expect(sample().entities[1]!.position).toEqual(saved.entities[1]!.position);expect(first).toEqual(saved);
  });

  test('immutable TRS unsafe callbacks and timelines use detached fallback with no cache allocation', async () => {
    const {project,assets}=fixture(),viewport={width:800,height:600},runtime=await createHyperfocus3DRuntime(project,assets);
    expect(()=>runtime.withSampledFrame({sample:{viewport},entitySampling:'immutable-trs',operation:frame=>frame})).toThrow('writer journal');
    runtime.acquireEndpointProducer({writableEntityIds:[]});
    const frame=runtime.withSampledFrame({sample:{viewport},entitySampling:'immutable-trs',operation:frame=>{frame.entities[0]!.position[0]=4;runtime.applyFrame(frame);return frame;}});
    expect(frame.entities[0]!.position[0]).toBe(4);expect(Object.isFrozen(frame.entities[0]!.position)).toBe(false);
    expect(runtime.readEntitySamplingWork()).toMatchObject({requestedImmutable:1,immutableSamples:0,detachedSamples:1,fallbackSamples:1,missingContractFallbacks:1,unsupportedTimelineFallbacks:0,cacheReferenceCapacity:0});
    const timeline:Hyperfocus3DTimeline={version:2,sceneId:'level',durationFrames:10,fps:30,background:'#000000',groups:[],materialTracks:[],shots:[]};
    runtime.withSampledFrame({sample:{viewport,timeline},entitySampling:'immutable-trs',contract:'declared-entity-writes',operation:frame=>{frame.entities[1]!.scale[0]=2;runtime.applyFrame(frame);}});
    expect(runtime.readEntitySamplingWork()).toMatchObject({requestedImmutable:1,immutableSamples:0,fallbackSamples:1,missingContractFallbacks:0,unsupportedTimelineFallbacks:1,cacheReferenceCapacity:0});
  });

  test('immutable TRS exceptions, reentry, escaped apply and deleted resources revoke borrowed authority', async () => {
    for(const failure of ['throw','reenter','transform','instance','material','light','scale'] as const){
      const {project,assets}=fixture(),viewport={width:800,height:600};delete project.extensions.hyperfocus3D.scenes[0].entities[1].animation;
      const materials=project.extensions.hyperfocus3D.materials;materials.push({...materials[0],id:'unused-surface'});
      const runtime=await createHyperfocus3DRuntime(project,assets);runtime.acquireEndpointProducer({writableEntityIds:['actor']});
      const sample=()=>runtime.withSampledFrame({sample:{viewport},entitySampling:'immutable-trs',contract:'declared-entity-writes',operation:frame=>{runtime.applyFrame(frame);return frame;}});
      const old=sample(),saved=structuredClone(old);sample();
      expect(()=>runtime.withSampledFrame({sample:{viewport},entitySampling:'immutable-trs',contract:'declared-entity-writes',operation:frame=>{
        if(failure==='throw')throw Error('callback');if(failure==='reenter')sample();
        if(failure==='transform')runtime.scene.transforms.destroy(1);
        if(failure==='instance')runtime.scene.destroyInstance(1);
        if(failure==='material')runtime.scene.destroyMaterial(1);
        if(failure==='light')runtime.scene.destroyLight(0);
        if(failure==='scale')frame.entities[0]!.scale[0]=NaN;
        runtime.applyFrame(frame);
      }})).toThrow();
      expect(old).toEqual(saved);expect(runtime.readEntitySamplingWork()).toMatchObject({cacheSlots:0,retainedVectorArrays:0,frameReferences:0});
      if(failure==='throw'||failure==='reenter'||failure==='scale'){
        const next=sample();expect(next.entities[1]!.position).not.toBe(old.entities[1]!.position);
        old.entities[1]!.position=[NaN,0,0];expect(()=>runtime.applyFrame(old)).toThrow();expect(runtime.readEntitySamplingWork()!.samples).toBe(0);
      }
    }
  });

  test('immutable TRS Promise callbacks lose authority while frozen tuples remain immutable after escape', async () => {
    const {project,assets}=fixture(),viewport={width:800,height:600};delete project.extensions.hyperfocus3D.scenes[0].entities[1].animation;
    const runtime=await createHyperfocus3DRuntime(project,assets);runtime.acquireEndpointProducer({writableEntityIds:['actor']});
    const frame=await runtime.withSampledFrame({sample:{viewport},entitySampling:'immutable-trs',contract:'declared-entity-writes',operation:async frame=>{
      await Promise.resolve();expect(runtime.readEntitySamplingWork()!.frameReferences).toBe(0);
      expect(()=>{frame.entities[1]!.position[0]=NaN;}).toThrow();frame.entities[1]!.position=[NaN,0,0];
      expect(()=>runtime.applyFrame(frame)).toThrow();expect(runtime.readEntityTrsJournalWork()!.numericReuses).toBe(0);return frame;
    }});
    expect(Number.isNaN(frame.entities[1]!.position[0])).toBe(true);
    const next=runtime.withSampledFrame({sample:{viewport},entitySampling:'immutable-trs',contract:'declared-entity-writes',operation:frame=>{runtime.applyFrame(frame);return frame;}});
    expect(next.entities[1]!.position).toEqual([2,0,0]);expect(runtime.readEntitySamplingWork()!.cacheHits).toBe(0);
  });
  test('material presentation history reset preserves resources and repeats canonical cold work', async () => {
    const { project, assets } = fixture(), viewport = { width: 800, height: 600 };
    const runtime = await createHyperfocus3DRuntime(project, assets), frame = runtime.sampleFrame({ viewport });
    const update = runtime.scene.updateMaterial;let updates = 0;
    runtime.scene.updateMaterial = (...args) => { updates++;return update(...args); };
    const snapshot = runtime.snapshot(), cold: number[] = [];
    for (let pass = 0; pass < 3; pass++) {
      runtime.applyFrame(frame);runtime.applyFrame(frame);
      const before = updates, data = runtime.scene.materialData.slice(), flags = runtime.scene.materialFlags.slice(), textures = runtime.scene.materialTextureHandles.slice();
      runtime.resetPresentationMaterialHistory();
      expect(updates).toBe(before);expect(runtime.scene.materialData).toEqual(data);expect(runtime.scene.materialFlags).toEqual(flags);expect(runtime.scene.materialTextureHandles).toEqual(textures);
      runtime.applyFrame(frame);cold.push(updates - before);const after = updates;runtime.applyFrame(frame);expect(updates).toBe(after);
    }
    expect(cold[0]).toBeGreaterThan(0);expect(cold).toEqual([cold[0]!, cold[0]!, cold[0]!]);expect(runtime.snapshot()).toEqual(snapshot);
    runtime.resetPresentationMaterialHistory();Object.assign(frame.materials[0]!.look, { roughness: NaN });expect(() => runtime.applyFrame(frame)).toThrow();
    const endpoint = await createHyperfocus3DRuntime(project, assets);endpoint.acquireEndpointProducer();
    expect(() => endpoint.resetPresentationMaterialHistory()).toThrow('Endpoint producer');
  });

  test('TRS journal reuses only scoped static inputs while preserving detached gameplay, scale and command changes', async () => {
    const { project, assets } = fixture(), viewport = { width: 800, height: 600 };
    const authored = project.extensions.hyperfocus3D.scenes[0].entities;
    delete authored[0].controller;delete authored[1].animation;
    const full = await createHyperfocus3DRuntime(project, assets), candidate = await createHyperfocus3DRuntime(project, assets);
    const checkpoint = candidate.checkpoint();
    candidate.acquireEndpointProducer({ writableEntityIds: ['actor'] });
    const sample = () => candidate.withSampledFrame({ sample: { viewport }, operation: frame => {
      frame.entities[0]!.position[1] += 2;candidate.applyFrame(frame);return frame;
    }, contract: 'declared-entity-writes' });
    const first = sample(), second = sample();
    expect(first).toEqual(second);expect(first).not.toBe(second);expect(first.entities[1]!.scale).not.toBe(second.entities[1]!.scale);
    expect(candidate.readEntityTrsJournalWork()).toMatchObject({ numericValidations: 1, numericReuses: 1, liveTransformChecks: 2, applicationSlots: 2, sampleVisits: 2, scaleComparisons: 6, retainedFrameReferences: 0 });
    expect(candidate.readEndpointApplicationWork()).toMatchObject({ entityVisits: 2, transformValidations: 1, instanceResourceValidations: 2 });
    const oracle = full.sampleFrame({ viewport });oracle.entities[0]!.position[1] += 2;expect(second).toEqual(oracle);expect(candidate.snapshot()).toEqual(full.snapshot());
    for (const scale of [-0, 2, NaN]) {
      candidate.declaration.scenes[0]!.entities[1]!.scale[0] = scale;
      if (Number.isNaN(scale)) expect(sample).toThrow();
      else { expect(Object.is(sample().entities[1]!.scale[0], scale)).toBe(true);expect(candidate.readEntityTrsJournalWork()!.numericValidations).toBe(2);sample();expect(candidate.readEntityTrsJournalWork()!.numericReuses).toBe(1); }
    }
    candidate.declaration.scenes[0]!.entities[1]!.scale[0] = 1;sample();sample();
    const commands: Parameters<typeof candidate.applyCommands>[0]['commands'] = [{ type: 'teleport', entityId: 'spinner', position: [4, 1, 0] }, { type: 'rotate', entityId: 'spinner', rotationY: .4 }, { type: 'pose', entityId: 'spinner', rotation: [0, 0, 0, 1] }];
    for (const command of commands) {
      candidate.applyCommands({ commands: [command] });sample();expect(candidate.readEntityTrsJournalWork()!.numericValidations).toBe(2);sample();expect(candidate.readEntityTrsJournalWork()!.numericReuses).toBe(1);
    }
    checkpoint.restore();sample();expect(candidate.readEntityTrsJournalWork()!.numericValidations).toBe(2);
    first.entities[1]!.position[0] = NaN;expect(() => candidate.applyFrame(first)).toThrow();
    expect(candidate.snapshot()).toEqual(full.snapshot());
  });

  test('TRS journal authority expires on return, promises, exceptions and arbitrary callback fallback', async () => {
    const { project, assets } = fixture(), viewport = { width: 800, height: 600 };
    const runtime = await createHyperfocus3DRuntime(project, assets);runtime.acquireEndpointProducer({ writableEntityIds: [] });
    const sample = () => runtime.withSampledFrame({ sample: { viewport }, operation: frame => { runtime.applyFrame(frame);return frame; }, contract: 'declared-entity-writes' });
    sample();sample();expect(runtime.readEntityTrsJournalWork()!.numericReuses).toBe(2);
    expect(() => runtime.withSampledFrame({ sample: { viewport }, operation: frame => { frame.entities[0]!.rotation = [0, 0, 0, 0];runtime.applyFrame(frame); } })).toThrow();
    sample();expect(runtime.readEntityTrsJournalWork()!.numericValidations).toBe(2);
    expect(() => runtime.withSampledFrame({ sample: { viewport }, operation: () => { sample(); }, contract: 'declared-entity-writes' })).toThrow('reenter');
    sample();expect(runtime.readEntityTrsJournalWork()!.numericValidations).toBe(2);
    expect(() => runtime.withSampledFrame({ sample: { viewport }, operation: frame => { runtime.applyFrame(frame);throw Error('callback'); }, contract: 'declared-entity-writes' })).toThrow('callback');
    sample();expect(runtime.readEntityTrsJournalWork()!.numericValidations).toBe(2);
    const returned = await runtime.withSampledFrame({ sample: { viewport }, operation: async frame => { await Promise.resolve();frame.entities[1]!.position[0] = NaN;return frame; }, contract: 'declared-entity-writes' });
    expect(() => runtime.applyFrame(returned)).toThrow();expect(runtime.readEntityTrsJournalWork()!.fallbackApplications).toBe(1);
    sample();sample();
    runtime.withSampledFrame({ sample: { viewport }, operation: frame => { frame.performances = [{ entityId: 'unused', rigId: 'unused-rig', clipId: 'unused-clip', timeSeconds: 0, sourceStartSeconds: 0, loop: false }];runtime.applyFrame(frame); }, contract: 'declared-entity-writes' });
    expect(runtime.readEntityTrsJournalWork()).toMatchObject({ fullFallbackApplications: 1, validationCountersAvailable: 0, numericReuses: 0 });
    sample();expect(runtime.readEntityTrsJournalWork()!.retainedFrameReferences).toBe(0);
  });

  test('TRS journal retains live resources, late failure revocation and motion generation invalidation', async () => {
    for (const resource of ['transform', 'instance', 'mesh', 'material', 'light'] as const) {
      const { project, assets } = fixture(), viewport = { width: 800, height: 600 };
      const declaration=project.extensions.hyperfocus3D;
      declaration.meshes.push({...declaration.meshes[0],id:'other-mesh'});declaration.materials.push({...declaration.materials[0],id:'other-material'});
      declaration.scenes[0].entities[0].variants=[{id:'other',meshId:'other-mesh',materialId:'other-material'}];
      const runtime = await createHyperfocus3DRuntime(project, assets);let removed=false;
      expect(() => runtime.acquireEndpointProducer({ writableEntityIds: [], materialRevisionNamespace: '' })).toThrow();expect(runtime.readEntityTrsJournalWork()).toBeUndefined();expect(() => runtime.compile()).not.toThrow();
      runtime.acquireEndpointProducer({ writableEntityIds: [] });
      const sample = () => runtime.withSampledFrame({ sample: { viewport }, operation: frame => { if(removed&&resource==='mesh')frame.entities[0]!.variantId='other';runtime.applyFrame(frame);return frame; }, contract: 'declared-entity-writes' });
      sample();sample();expect(runtime.readEntityTrsJournalWork()!.numericReuses).toBe(2);
      runtime.advance({ actions: ['move-right'] });sample();expect(runtime.readEntityTrsJournalWork()!.numericValidations).toBe(2);
      sample();expect(runtime.readEntityTrsJournalWork()!.numericReuses).toBe(2);
      if (resource === 'transform') runtime.scene.transforms.destroy(0);
      if (resource === 'instance') runtime.scene.destroyInstance(0);
      if (resource === 'mesh') runtime.scene.destroyMesh(1);
      if (resource === 'material') runtime.scene.destroyMaterial(1);
      if (resource === 'light') runtime.scene.destroyLight(0);
      removed=true;expect(sample).toThrow();expect(runtime.readEntityTrsJournalWork()!.retainedFrameReferences).toBe(0);
    }
  });
  test('explicit presentation reset restores authored TRS and cold application history without changing gameplay', async () => {
    for (const strategy of ['original', 'retained-input', 'leased-input'] as const) {
      const { project, assets } = fixture();
      project.extensions.hyperfocus3D.scenes[0].entities[0].scale = [1.25, .7, 2.1];
      project.extensions.hyperfocus3D.scenes[0].entities[0].rotationY = .73;
      const runtime = await createHyperfocus3DRuntime(project, assets, { entityApplication: strategy, entityApplicationDiagnostics: true });
      const packed = () => [runtime.scene.transforms.positions.slice(), runtime.scene.transforms.rotations.slice(), runtime.scene.transforms.scales.slice()];
      const authored = packed();runtime.advance({ actions: ['move-right'] });
      const simulation = runtime.snapshot(), checkpoint = runtime.checkpoint();
      const frame = runtime.sampleFrame({ viewport: { width: 800, height: 600 } });
      frame.entities[0]!.position[0] += 4;frame.entities[0]!.scale = [2, 3, 4];frame.entities[0]!.rotation = [1, 2, 3, 4];
      const lease = strategy === 'leased-input' ? createEntityInputLease3D(frame.entities) : undefined;
      const sample = () => { runtime.applyFrame(frame, lease);return { work: { ...runtime.readEntityApplicationWork() }, matrix: runtime.compile().instanceMatrices.slice() }; };
      runtime.resetPresentationTransforms();expect(packed()).toEqual(authored);
      const first = sample(), repeat = sample(), capacity = first.work.entityTransformCacheBytes;
      for (let pass = 0; pass < 3; pass++) {
        runtime.scene.transforms.setPosition(0, 99 + pass, -4, 7);runtime.scene.transforms.setScale(0, 6, 8, 9);
        runtime.scene.transforms.setRotationQuaternion(0, 3, 1, 5, 2);sample();
        runtime.resetPresentationTransforms();expect(packed()).toEqual(authored);
        expect(runtime.snapshot()).toEqual(simulation);expect(() => checkpoint.assertValid()).not.toThrow();
        expect(runtime.readEntityApplicationWork()).toMatchObject({ entityTransformComparisons: 0, entityTransformWrites: 0, entityTransformReuses: 0, entityTransformCacheEntries: 0, entityTransformCacheBytes: capacity });
        expect(sample()).toEqual(first);expect(sample()).toEqual(repeat);
      }
      if (lease) { runtime.resetPresentationTransforms();lease.revoke();expect(() => runtime.applyFrame(frame, lease)).toThrow('revoked'); }
      runtime.scene.destroyInstance(0);runtime.resetPresentationTransforms();
      expect(() => runtime.applyFrame(frame)).toThrow();
    }
  });

  test('presentation reset validates live transforms, invalidates failed history and rejects endpoint ownership', async () => {
    const { project, assets } = fixture();
    const runtime = await createHyperfocus3DRuntime(project, assets, { entityApplication: 'retained-input', entityApplicationDiagnostics: true });
    const frame = runtime.sampleFrame({ viewport: { width: 800, height: 600 } });runtime.applyFrame(frame);
    const authored = runtime.declaration.scenes[0]!.entities[0]!;const scale = authored.scale[0];
    authored.scale[0] = NaN;
    expect(() => runtime.resetPresentationTransforms()).toThrow();
    expect(runtime.readEntityApplicationWork().entityTransformCacheEntries).toBe(0);
    authored.scale[0] = scale;runtime.resetPresentationTransforms();runtime.applyFrame(frame);
    expect(runtime.readEntityApplicationWork().entityTransformReuses).toBe(0);
    runtime.scene.transforms.destroy(0);expect(() => runtime.resetPresentationTransforms()).toThrow();
    expect(runtime.readEntityApplicationWork().entityTransformCacheEntries).toBe(0);
    const endpoint = await createHyperfocus3DRuntime(project, assets);endpoint.acquireEndpointProducer();
    expect(() => endpoint.resetPresentationTransforms()).toThrow('Endpoint producer');
  });

  test('endpoint revision runtime publication revokes on early and late failures, restore and explicit fallback', async () => {
    const { project, assets } = fixture();project.extensions.hyperfocus3D.scenes[0].effectCapacity = 1;
    const runtime = await createHyperfocus3DRuntime(project, assets), viewport = { width: 800, height: 600 };
    const checkpoint = runtime.checkpoint(), snapshot = runtime.snapshot();
    expect(() => runtime.readEndpointMaterialInputRevisions()).toThrow('Missing endpoint');
    expect(runtime.readEndpointMaterialRevisionWork()).toBeUndefined();
    expect(() => runtime.acquireEndpointProducer({ materialRevisionNamespace: '' })).toThrow('namespace');
    expect(() => runtime.compile()).not.toThrow(); // Invalid options do not acquire the irreversible owner.
    runtime.acquireEndpointProducer({ materialRevisionNamespace: 'runtime-world:endpoint' });
    const frame = runtime.sampleFrame({ viewport });
    const read = () => {
      const value = runtime.readEndpointMaterialInputRevisions();
      if (value.source !== 'endpoint') throw Error('Expected endpoint revision issuer');
      return value;
    };
    runtime.applyFrame(frame);const original = read(), originalValues = original.values.slice();
    expect(original.namespace).toBe('runtime-world:endpoint');
    const failures: Array<(value: typeof frame) => void> = [
      value => { value.sceneId = 'missing'; },
      value => { value.entities[0]!.position[0] = NaN; },
      value => { Object.assign(value.materials[0]!.look, { roughness: NaN }); },
      value => { Object.assign(value.lights[0]!, { intensity: NaN }); },
      value => { value.effects = [{ id: 'invalid', kind: 'sparks', materialId: 'missing', presentation: 'billboard', particles: [{ id: 'particle', position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1], color: [1, 1, 1, 1] }] }]; },
      value => { value.socketAttachments = [{ id: 'invalid', entityId: 'actor', parentEntityId: 'missing', boneId: 'missing-bone', startFrame: 0, durationFrames: 1, position: [0, 0, 0], rotationEuler: [0, 0, 0], scale: [1, 1, 1] }]; },
    ];
    for (const mutate of failures) {
      runtime.applyFrame(frame);const bad = structuredClone(frame);mutate(bad);
      expect(() => runtime.applyFrame(bad)).toThrow();
      expect(() => runtime.readEndpointMaterialInputRevisions()).toThrow('unavailable');
      expect(runtime.readEndpointMaterialRevisionWork()).toMatchObject({ available: 0, allocations: 1 });
      runtime.applyFrame(frame);expect(read().values).toBe(original.values);expect(read().values).toEqual(originalValues);
    }
    const fallback = structuredClone(frame);fallback.performances = [{ entityId: 'unused', rigId: 'unused-rig', clipId: 'unused-clip', timeSeconds: 0, sourceStartSeconds: 0, loop: false }];
    runtime.applyFrame(fallback);expect(runtime.readEndpointMaterialInputRevisions()).toEqual({ source: 'full-fallback' });
    expect(runtime.readEndpointMaterialRevisionWork()!.available).toBe(0);
    Object.assign(fallback.lights[0]!, { intensity: NaN });expect(() => runtime.applyFrame(fallback)).toThrow();
    expect(() => runtime.readEndpointMaterialInputRevisions()).toThrow('unavailable');
    runtime.applyFrame(frame);expect(read().values).toEqual(originalValues);
    for (const reset of [() => runtime.restore(snapshot), () => checkpoint.restore(), () => runtime.restore({ ...snapshot, sceneId: 'missing' })]) {
      runtime.applyFrame(frame);try { reset(); } catch { /* Failed restore must also revoke publication. */ }
      expect(() => runtime.readEndpointMaterialInputRevisions()).toThrow('unavailable');
      expect(runtime.readEndpointMaterialRevisionWork()!.available).toBe(0);
    }
    runtime.applyFrame(frame);expect(read().values).toEqual(originalValues);
    expect(runtime.readEndpointApplicationWork()).toMatchObject({ materialInputComparisons: 1, materialResourceValidations: 1, fullEffectPasses: 1, fullLightApplications: 2 });
  });

  test('endpoint revision runtime stays allocation-free when disabled and preserves lease-guard revocation', async () => {
    const { project, assets } = fixture(), runtime = await createHyperfocus3DRuntime(project, assets);
    runtime.acquireEndpointProducer();runtime.applyFrame(runtime.sampleFrame({ viewport: { width: 800, height: 600 } }));
    expect(runtime.readEndpointMaterialInputRevisions()).toEqual({ source: 'disabled' });expect(runtime.readEndpointMaterialRevisionWork()).toBeUndefined();
    const candidate = await createHyperfocus3DRuntime(project, assets);
    candidate.acquireEndpointProducer({ materialRevisionNamespace: 'lease-guard:endpoint' });
    const frame = candidate.sampleFrame({ viewport: { width: 800, height: 600 } });candidate.applyFrame(frame);
    const invalid = { lease: createEntityInputLease3D(frame.entities) };Object.assign(invalid, { lease: {} });
    expect(() => candidate.applyFrame(frame, invalid.lease)).toThrow('display input leases');
    expect(() => candidate.readEndpointMaterialInputRevisions()).toThrow('unavailable');expect(candidate.readEndpointMaterialRevisionWork()!.available).toBe(0);
  });

  test('endpoint producer preserves simulation, sampled frames, restores and independent display packets', async () => {
    const { project, assets } = fixture(), viewport = { width: 1366, height: 768 };
    const full = await createHyperfocus3DRuntime(project, assets), endpoint = await createHyperfocus3DRuntime(project, assets), display = await createHyperfocus3DRuntime(project, assets);
    const initialCapacity = structuredClone(endpoint.compile()), compileAlias = endpoint.compile, viewsAlias = endpoint.compileViews;
    const fullCheckpoint = full.checkpoint(), endpointCheckpoint = endpoint.checkpoint();endpoint.acquireEndpointProducer();
    expect(() => endpoint.acquireEndpointProducer()).toThrow('already');expect(() => compileAlias()).toThrow('Endpoint producer');
    expect(() => viewsAlias(full.viewProjection(1))).toThrow('Endpoint producer');
    for (let pass = 0; pass < 2; pass++) {
      for (let step = 0; step < 8; step++) {
        for (const runtime of [full, endpoint]) runtime.advance({ actions: ['move-right'] });
        const first = full.sampleFrame({ viewport }), second = endpoint.sampleFrame({ viewport });expect(second).toEqual(first);
        // Presentation-only TRS/material mutations must never leak into gameplay.
        for (const frame of [first, second]) { frame.entities[0]!.position[1] += step / 10;Object.assign(frame.materials[0]!.look, { opacity: .5 }); }
        full.applyFrame(first);endpoint.applyFrame(second);display.applyFrame(second);
        expect(endpoint.snapshot()).toEqual(full.snapshot());expect(display.compile()).toEqual(full.compile());
        expect(endpoint.readEndpointApplicationWork()).toMatchObject({ staticApplications: 1, fullFallbacks: 0, fullEffectPasses: 1, fullLightApplications: 2 });
      }
      fullCheckpoint.restore();endpointCheckpoint.restore();expect(endpoint.snapshot()).toEqual(full.snapshot());
    }
    expect(display.compile().instanceMatrices.length).toBe(initialCapacity.instanceMatrices.length);
  });

  test('endpoint producer retains full light/effect validation and unsupported performance fallback', async () => {
    for (const endpointMode of [false, true]) {
      const { project, assets } = fixture();project.extensions.hyperfocus3D.scenes[0].effectCapacity = 1;
      const runtime = await createHyperfocus3DRuntime(project, assets), viewport = { width: 800, height: 600 };
      runtime.compile();if (endpointMode) runtime.acquireEndpointProducer();
      const frame = runtime.sampleFrame({ viewport });frame.performances = [{ entityId: 'unused', rigId: 'unused-rig', clipId: 'unused-clip', timeSeconds: 0, sourceStartSeconds: 0, loop: false }];
      runtime.applyFrame(frame);if (endpointMode) expect(runtime.readEndpointApplicationWork()).toMatchObject({ fullFallbacks: 1, performanceFallbacks: 1 });
      frame.performances = [];runtime.applyFrame(frame);if (endpointMode) expect(runtime.readEndpointApplicationWork()).toMatchObject({ fullFallbacks: 0, staticApplications: 1 });
      Object.assign(frame.lights[0]!, { intensity: NaN });expect(() => runtime.applyFrame(frame)).toThrow('intensity');
      Object.assign(frame.lights[0]!, { intensity: 1 });
      frame.effects = [{ id: 'invalid', kind: 'sparks', materialId: 'missing', presentation: 'billboard', particles: [{ id: 'particle', position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1], color: [1, 1, 1, 1] }] }];
      expect(() => runtime.applyFrame(frame)).toThrow('missing');
      frame.effects = [];frame.socketAttachments = [{ id: 'invalid', entityId: 'actor', parentEntityId: 'missing', boneId: 'missing-bone', startFrame: 0, durationFrames: 1, position: [0, 0, 0], rotationEuler: [0, 0, 0], scale: [1, 1, 1] }];
      expect(() => runtime.applyFrame(frame)).toThrow('rigged parent');
    }
  });
  test('endpoint producer keeps skeletal/root-motion evaluation on the full path across rewinds', async () => {
    const bytes = new Uint8Array(await Bun.file(new URL('../../fixtures/gltf-skin-animation/two-joint.gltf', import.meta.url)).arrayBuffer());
    const assets = [{ id: 'fighter-gltf', mimeType: 'model/gltf+json', bytes }], project = skinnedFixture();
    const full = await createHyperfocus3DRuntime(project, assets), endpoint = await createHyperfocus3DRuntime(project, assets);
    endpoint.compile();endpoint.acquireEndpointProducer();
    const timeline: Hyperfocus3DTimeline = { version: 2, sceneId: 'arena', durationFrames: 60, fps: 30, background: '#000000', groups: [], materialTracks: [], shots: [],
      performanceTracks: [{ entityId: 'fighter', rigId: 'fighter-rig', segments: [{ id: 'wave', startFrame: 0, durationFrames: 60, clipId: 'wave', sourceStartSeconds: 0, speed: 1, loop: true, blendFrames: 0,
        rootMotion: { mode: 'extract-xyz', loopBoundary: 'accumulate', rootBoneId: 'Tip' } }] }],
    };
    for (const frameIndex of [0, 15, 30, 4, 15]) {
      const frame = sample3DFrame({ declaration: full.declaration, viewport: { width: 800, height: 600 }, clock: { kind: 'video', frameIndex, fps: 30 }, timeline });
      full.applyFrame(frame);endpoint.applyFrame(structuredClone(frame));
      expect(endpoint.scene.skeletonMatrices).toEqual(full.scene.skeletonMatrices);expect(endpoint.scene.transforms.positions).toEqual(full.scene.transforms.positions);
      expect(endpoint.readEndpointApplicationWork()).toMatchObject({ fullFallbacks: 1, skeletonFallbacks: 1, staticApplications: 0, fullLightApplications: 1 });
    }
  });
  test('retained entity application is an explicit runtime option and preserves simulation/checkpoint packets', async () => {
    const { project, assets } = fixture();
    const runtimes = await Promise.all((['original', 'retained-input'] as const).map(entityApplication => createHyperfocus3DRuntime(project, assets, { entityApplication, entityApplicationDiagnostics: true })));
    const checkpoints = runtimes.map(runtime => runtime.checkpoint()), viewport = { width: 1366, height: 768 };
    for (let index = 0; index < 8; index++) {
      const packets = runtimes.map(runtime => {
        runtime.advance({ actions: ['move-right'] });runtime.applyFrame(runtime.sampleFrame({ viewport }));
        return structuredClone(runtime.compile());
      });
      expect(packets[0]).toEqual(packets[1]);expect(runtimes[0]!.snapshot()).toEqual(runtimes[1]!.snapshot());
    }
    for (const checkpoint of checkpoints) checkpoint.restore();
    for (const runtime of runtimes) { runtime.applyFrame(runtime.sampleFrame({ viewport }));runtime.applyFrame(runtime.sampleFrame({ viewport })); }
    expect(runtimes[0]!.compile()).toEqual(runtimes[1]!.compile());
    expect(runtimes[0]!.readEntityApplicationWork().entityTransformCacheBytes).toBe(0);
    expect(runtimes[1]!.readEntityApplicationWork().entityTransformComparisons).toBe(0);
    expect(runtimes[1]!.readEntityApplicationWork().entityTransformReuses).toBeGreaterThan(0);
  });
  test('retained presentation bindings survive advance and rollback without replacing full detached snapshots', async () => {
    const { project, assets } = fixture(), runtime = await createHyperfocus3DRuntime(project, assets);
    const checkpoint = runtime.checkpoint(), snapshot = runtime.snapshot(), viewport = { width: 1366, height: 768 };
    runtime.applyFrame(runtime.sampleFrame({ viewport }));const original = runtime.compile().instanceMatrices.slice();
    for (let index = 0; index < 10; index++) { runtime.advance({ actions: ['move-right'] });runtime.applyFrame(runtime.sampleFrame({ viewport })); }
    expect(runtime.snapshot()).not.toEqual(snapshot);
    checkpoint.restore();runtime.applyFrame(runtime.sampleFrame({ viewport }));
    expect(runtime.snapshot()).toEqual(snapshot);expect(runtime.compile().instanceMatrices).toEqual(original);
    const exported = runtime.snapshot();expect(exported.entities).toHaveLength(runtime.declaration.scenes[0]!.entities.length);
    exported.entities[0]!.position[0] = 999;expect(runtime.snapshot()).toEqual(snapshot);
  });
  test('direct render sampling matches snapshot sampling across movement, quaternion commands and restore without aliasing', async () => {
    const { project, assets } = fixture(), runtime = await createHyperfocus3DRuntime(project, assets);
    const checkpoint = runtime.checkpoint(), viewport = { width: 1366, height: 768 };
    const compare = () => {
      const before = runtime.snapshot();
      const expected = sample3DFrame({ declaration: runtime.declaration, viewport, clock: { kind: 'simulation', tick: before.tick, ticksPerSecond: 60 }, simulation: new Map(before.entities.map(entity => [entity.id, entity])) });
      const actual = runtime.sampleFrame({ viewport });expect(actual).toEqual(expected);
      actual.entities[0]!.position[0] = 999;actual.entities[0]!.rotation[0] = 999;actual.camera.target[0] = 999;
      expect(runtime.snapshot()).toEqual(before);expect(runtime.sampleFrame({ viewport })).toEqual(expected);
    };
    compare();
    for (let index = 0; index < 20; index++) { runtime.advance({ actions: ['move-right'] });compare(); }
    runtime.applyCommands({ commands: [{ type: 'pose', entityId: 'actor', rotation: [0, .6, 0, .8] }] });compare();
    checkpoint.restore();compare();
  });
  test('individual simulation poses match exported snapshots and remain detached across restore', async () => {
    const { project, assets } = fixture(), runtime = await createHyperfocus3DRuntime(project, assets);
    const checkpoint = runtime.checkpoint();
    for (let index = 0; index < 8; index++) runtime.advance({ actions: ['move-right'] });
    const snapshot = runtime.snapshot();
    expect(runtime.tick).toBe(snapshot.tick);
    for (const entity of snapshot.entities) expect(runtime.entityState(entity.id)).toEqual(entity);
    const pose = runtime.entityState('actor');pose.position[0] = 999;
    expect(runtime.entityState('actor')).toEqual(snapshot.entities.find(entity => entity.id === 'actor')!);
    expect(() => runtime.entityState('missing')).toThrow('missing');
    checkpoint.restore();
    expect(runtime.tick).toBe(0);
    expect(runtime.entityState('actor')).toEqual(runtime.snapshot().entities.find(entity => entity.id === 'actor')!);
  });
  test('material presentation does not rescan a city-sized authored catalog for every material', async () => {
    const { project, assets } = fixture(), declaration = project.extensions.hyperfocus3D;
    declaration.budgets.materials = 512;declaration.budgets.entities = 512;
    for (let index = 0; index < 500; index++) {
      declaration.materials.push({ ...structuredClone(declaration.materials[0]), id: `city:${index}` });
      declaration.scenes[0].entities.push({ ...structuredClone(declaration.scenes[0].entities[1]), id: `prop:${index}`, materialId: `city:${index}` });
    }
    const runtime = await createHyperfocus3DRuntime(project, assets);
    const frame = sample3DFrame({ declaration: runtime.declaration, clock: { kind: 'simulation', tick: 0, ticksPerSecond: 60 }, viewport: { width: 1366, height: 768 } });
    let reads = 0;
    for (const material of runtime.declaration.materials) {
      const id = material.id;Object.defineProperty(material, 'id', { get() { reads++;return id; }, configurable: true });
    }
    runtime.applyFrame(frame);
    expect(reads).toBeLessThan(runtime.declaration.materials.length * 4);
    expect(runtime.compile().commandCount).toBe(501);
  });
  test('frame-only material rebatching restores authored and variant handles on the next frame', async () => {
    const { project, assets } = fixture(), declaration = project.extensions.hyperfocus3D;
    declaration.materials.push({ ...structuredClone(declaration.materials[0]), id: 'alternate' });
    declaration.scenes[0].entities[1].variants = [{ id: 'changed', meshId: 'triangle', materialId: 'alternate' }];
    const authored = structuredClone(project), runtime = await createHyperfocus3DRuntime(project, assets), snapshot = runtime.snapshot();
    const frame = sample3DFrame({ declaration: runtime.declaration, clock: { kind: 'simulation', tick: 0, ticksPerSecond: 60 }, viewport: { width: 1440, height: 900 } });
    frame.entities[1]!.variantId = 'changed';runtime.applyFrame(frame);
    expect(runtime.compile().commandCount).toBe(2);
    frame.entities[1]!.renderMaterialId = 'surface';runtime.applyFrame(frame);
    expect(runtime.compile().commandCount).toBe(1);
    delete frame.entities[1]!.renderMaterialId;runtime.applyFrame(frame);
    expect(runtime.compile().commandCount).toBe(2);
    delete frame.entities[1]!.variantId;runtime.applyFrame(frame);
    expect(runtime.compile().commandCount).toBe(1);
    expect(project).toEqual(authored);expect(runtime.snapshot()).toEqual(snapshot);
    frame.entities[1]!.renderMaterialId = 'missing';expect(() => runtime.applyFrame(frame)).toThrow('missing');
  });
  test('extension-retained presentation materials can render while unreachable materials stay pruned', async () => {
    const { project, assets } = fixture(), declaration = project.extensions.hyperfocus3D;
    declaration.materials.push({ ...structuredClone(declaration.materials[0]), id: 'feedback', baseColor: [1, .2, .1, 1] });
    declaration.materials.push({ ...structuredClone(declaration.materials[0]), id: 'unreachable' });
    project.extensions.fixturePresentation = { materialIds: ['feedback'] };
    const authored = structuredClone(project), runtime = await createHyperfocus3DRuntime(project, assets), snapshot = runtime.snapshot();
    expect(runtime.scene.materialCount).toBe(2);
    expect(runtime.scene.textureCount).toBe(1);
    const frame = sample3DFrame({ declaration: runtime.declaration, clock: { kind: 'simulation', tick: 0, ticksPerSecond: 60 }, viewport: { width: 1440, height: 900 } });
    expect(runtime.compile().commandCount).toBe(1);
    frame.entities[1]!.renderMaterialId = 'feedback';runtime.applyFrame(frame);
    expect(runtime.compile().commandCount).toBe(2);
    delete frame.entities[1]!.renderMaterialId;runtime.applyFrame(frame);
    expect(runtime.compile().commandCount).toBe(1);
    expect(project).toEqual(authored);expect(runtime.snapshot()).toEqual(snapshot);
    frame.entities[1]!.renderMaterialId = 'unreachable';
    expect(() => runtime.applyFrame(frame)).toThrow('3D variant material unreachable is missing');
  });
  test('declared texture replacement is detached, bounded and resettable without changing combat or authored data', async () => {
    const { project, assets } = fixture(), authored = structuredClone(project);
    const runtime = await createHyperfocus3DRuntime(project, assets), snapshot = runtime.snapshot(), physics = runtime.physics.checkpoint();
    const original = new Uint8Array(runtime.scene.getTexture(0).pixels), pixels = new Uint8Array(64).fill(90);
    runtime.replaceTexture({ textureId: 'checker', width: 4, height: 4, pixels });pixels.fill(0);
    expect(runtime.scene.getTexture(0).pixels[0]).toBe(90);expect(runtime.scene.textureBytes).toBe(64);expect(runtime.scene.textureCount).toBe(1);
    const replaced = runtime.scene.getTexture(0);
    expect(() => runtime.replaceTexture({ textureId: 'missing', width: 1, height: 1, pixels: new Uint8Array(4) })).toThrow();
    expect(() => runtime.replaceTexture({ textureId: 'checker', width: 100, height: 100, pixels: new Uint8Array(40000) })).toThrow();
    expect(() => runtime.resetTexture({ textureId: 'missing' })).toThrow();expect(runtime.scene.getTexture(0)).toBe(replaced);expect(runtime.scene.textureBytes).toBe(64);
    // Reset uses a private copy, even if a host later reuses/mutates its input asset buffer.
    assets.find(asset => asset.id === 'rgba')!.bytes.fill(0);
    for (let index = 0; index < 3; index++) {
      runtime.resetTexture({ textureId: 'checker' });expect(runtime.scene.getTexture(0).pixels).toEqual(original);expect(runtime.scene.textureBytes).toBe(16);
      runtime.replaceTexture({ textureId: 'checker', width: 4, height: 4, pixels });
    }
    expect(runtime.snapshot()).toEqual(snapshot);expect(runtime.physics.checkpoint()).toEqual(physics);expect(project).toEqual(authored);
  });
  test('vertical lift carries a rider through the ascent and descent without sinking', async () => {
    const { project, assets } = fixture();
    const entities = project.extensions.hyperfocus3D.scenes[0].entities;
    const actor = entities[0];delete actor.controller;
    actor.position = [0, 1.2, 0];actor.scale = [.5, 1, .5];
    actor.physics = { type: 'dynamic', shape: 'box', gravityScale: 1, continuous: true };
    entities.push({ id: 'lift', meshId: actor.meshId, materialId: actor.materialId, position: [0, 0, 0], scale: [2, .2, 2], rotationY: 0,
      physics: { type: 'static', shape: 'box', gravityScale: 0, continuous: false }, animation: { kind: 'ping-pong', offset: [0, 3.2, 0], periodSeconds: 8, phase: 0 } });
    const runtime = await createHyperfocus3DRuntime(project, assets);
    let peak = 0;
    for (let tick = 0; tick < 480; tick++) {
      runtime.step();const lift = runtime.physics.body('lift')!, rider = runtime.physics.body('actor')!;
      peak = Math.max(peak, lift.y);
      expect(rider.y - lift.y).toBeGreaterThan(1.17);
      expect(rider.y - lift.y).toBeLessThan(1.25);
    }
    expect(peak).toBeCloseTo(3.2, 2);
    expect(runtime.physics.body('lift')!.y).toBeCloseTo(0, 4);
  });
  test('moving decks carry riders, detach jumps, and replay exact physical positions', async () => {
    const { project, assets } = fixture();
    const entities = project.extensions.hyperfocus3D.scenes[0].entities;
    const actor = entities[0];
    delete actor.controller;
    actor.position = [0, 1.2, 0]; actor.scale = [.5, 1, .5];
    actor.physics = { type: 'dynamic', shape: 'box', gravityScale: 1, continuous: true };
    entities.push({ id: 'deck', meshId: actor.meshId, materialId: actor.materialId, position: [0, 0, 0], scale: [2, .2, 2], rotationY: 0,
      physics: { type: 'static', shape: 'box', gravityScale: 0, continuous: false }, animation: { kind: 'ping-pong', offset: [4, 0, 0], periodSeconds: 8, phase: 0 } });
    const runtime = await createHyperfocus3DRuntime(project, assets);
    for (let i = 0; i < 120; i++) runtime.step();
    expect(runtime.physics.body('deck')!.x).toBeCloseTo(2, 5);
    expect(runtime.physics.body('actor')!.x).toBeCloseTo(2, 3);
    expect(runtime.physics.body('actor')!.y).toBeGreaterThan(1.19);
    const checkpoint = runtime.checkpoint();
    for (let i = 0; i < 80; i++) runtime.step();
    const expected = runtime.snapshot();
    checkpoint.restore();
    for (let i = 0; i < 80; i++) runtime.step();
    expect(runtime.snapshot()).toEqual(expected);
    runtime.physics.setVelocity('actor', 0, 8, 0);
    const before = runtime.physics.body('actor')!.x;
    runtime.step();
    expect(runtime.physics.body('actor')!.x).toBeCloseTo(before, 6);
    expect(runtime.physics.body('actor')!.y).toBeGreaterThan(1.3);
  });
  test('runtime checkpoints replay controller contacts and mutable body configuration', async () => {
    const { project, assets } = fixture();
    const actor = project.extensions.hyperfocus3D.scenes[0].entities[0];
    actor.position = [0, 1.2, 0];actor.scale = [.5, 1, .5];
    actor.physics = { type: 'dynamic', shape: 'box', gravityScale: 1, continuous: true };
    project.extensions.hyperfocus3D.scenes[0].entities.push({ id: 'floor', meshId: actor.meshId, materialId: actor.materialId,
      position: [0, 0, 0], scale: [20, .2, 20], rotationY: 0, physics: { type: 'static', shape: 'box', gravityScale: 0, continuous: false } });
    const runtime = await createHyperfocus3DRuntime(project, assets);
    for (let i = 0; i < 40; i++) runtime.step(['move-right']);
    const checkpoint = runtime.checkpoint();
    expect(checkpoint.state.physics.contacts.count).toBeGreaterThan(0);
    const continuation = () => { for (let i = 0; i < 25; i++) runtime.step(i < 10 ? ['move-left'] : ['move-up']); };
    continuation();const expected = runtime.checkpoint().state;
    runtime.physics.configureBody('actor', { type: 'kinematic', continuous: false, collisionMask: 0, collisionLayer: 8 });
    runtime.applyCommands({ commands: [{ type: 'pose', entityId: 'actor', rotation: [Math.SQRT1_2, 0, 0, Math.SQRT1_2] }] });
    checkpoint.restore();
    expect(runtime.checkpoint().state).toEqual(checkpoint.state);
    continuation();expect(runtime.checkpoint().state).toEqual(expected);
    checkpoint.restore();continuation();expect(runtime.checkpoint().state).toEqual(expected);
  });
  test('runtime checkpoint rejects topology and presentation configuration changes', async () => {
    const { project, assets } = fixture(), runtime = await createHyperfocus3DRuntime(project, assets);
    const checkpoint = runtime.checkpoint();
    runtime.physics.addBody({ id: 'late', shape: { kind: 'sphere', radius: 1 } });
    expect(() => checkpoint.restore()).toThrow('topology');
    const current = runtime.checkpoint();
    runtime.configurePhysicalPerformance({ version: 2, sceneId: runtime.declaration.activeSceneId,
      durationFrames: 60, fps: 60, background: '#000000', groups: [], materialTracks: [], shots: [] });
    expect(() => current.restore()).toThrow('configuration changes');
  });
  test("authored 3D poses stay atomic and restore both visible and physical orientation", async () => {
    const { project, assets } = fixture();
    const actor = project.extensions.hyperfocus3D.scenes[0].entities[0];
    delete actor.controller;
    actor.physics = { type: 'dynamic', shape: 'box', gravityScale: 0, continuous: false };
    project.extensions.hyperfocus3D.scenes[0].entities.push({ id: 'floor', meshId: actor.meshId, materialId: actor.materialId, position: [0, -4, 0], scale: [4, .2, 4], rotationY: 0, physics: { type: 'static', shape: 'box', gravityScale: 0, continuous: false } });
    const runtime = await createHyperfocus3DRuntime(project, assets);
    const q: [number, number, number, number] = [Math.SQRT1_2, 0, 0, Math.SQRT1_2];
    const before = runtime.snapshot();
    expect(() => runtime.applyCommands({ commands: [{ type: 'pose', entityId: 'actor', rotation: q }, { type: 'pose', entityId: 'actor', rotation: [1, 1, 0, 1] }] })).toThrow('normalized');
    expect(runtime.snapshot()).toEqual(before);
    expect(runtime.physics.body('actor')!.rotationX).toBe(0);
    runtime.applyCommands({ commands: [{ type: 'pose', entityId: 'actor', rotation: q }] });
    const posed = runtime.snapshot();
    expect(posed.entities.find(e => e.id === 'actor')!.rotation).toEqual(q);
    expect(runtime.physics.body('actor')!.rotationX).toBeCloseTo(Math.SQRT1_2);
    runtime.applyCommands({ commands: [{ type: 'rotate', entityId: 'actor', rotationY: 0 }] });
    expect(runtime.snapshot().entities.find(e => e.id === 'actor')!.rotation).toBeUndefined();
    runtime.restore(posed);
    expect(runtime.snapshot()).toEqual(posed);
    expect(runtime.physics.body('actor')!.rotationX).toBeCloseTo(Math.SQRT1_2);
    expect(runtime.physics.body('actor')!.angularVelocityX).toBe(0);
    expect(() => runtime.applyCommands({ commands: [{ type: 'rotate', entityId: 'floor', rotationY: .3 }] })).not.toThrow();
  });
  test("3D gameplay rejects a whole bad command batch and preserves earned state through recall", async () => {
    const { project, assets } = fixture();
    project.activeSceneId = 'logic';
    project.scenes = [{ id: 'logic', entities: [{ components: [{ id: 'rules', type: 'behavior', enabled: true, values: { module: './rules.ts', export: 'update' } }] }] }];
    delete project.extensions.hyperfocus3D.scenes[0].entities[0].controller;
    const runtime = await createHyperfocus3DRuntime(project, assets);
    let invalid = true;
    const game = createGameplay3D({ project, runtime, behaviors: { './rules.ts#update': () => ({ state: { keys: 2 }, commands: [{ type: 'teleport', entityId: 'actor', position: [3, 0, 0] }, ...(invalid ? [{ type: 'teleport', entityId: 'missing', position: [0, 0, 0] }] : [])], presentation: { title: 'Two earned keys' } }) } });
    const before = game.snapshot();
    expect(() => game.step(['interact'])).toThrow('unknown entity');
    expect(game.snapshot()).toEqual(before);
    invalid = false;game.step(['interact']);
    const earned = game.snapshot();expect(earned.entities.find(e => e.id === 'actor')?.position[0]).toBe(3);
    expect(earned.gameplay?.states.rules).toEqual({ keys: 2 });
    game.reset();expect(game.snapshot().gameplay?.states).toEqual({});
    game.restore(earned);expect(game.snapshot()).toEqual(earned);
    const poisoned = structuredClone(earned);poisoned.gameplay!.states.rules = { keys: Number.NaN };
    expect(() => game.restore(poisoned)).toThrow('portable JSON');expect(game.snapshot()).toEqual(earned);
  });

  test("3D behavior impulses use physical bodies and missing source cannot silently become a starter", async () => {
    const { project, assets } = fixture();
    const actor = project.extensions.hyperfocus3D.scenes[0].entities[0];delete actor.controller;
    actor.physics = { type: 'dynamic', shape: 'box', gravityScale: 0, continuous: false };
    project.activeSceneId = 'logic';project.scenes = [{ id: 'logic', entities: [{ components: [{ id: 'jump', type: 'behavior', enabled: true, values: { module: './jump.ts' } }] }] }];
    const runtime = await createHyperfocus3DRuntime(project, assets);
    expect(() => createGameplay3D({ project, runtime })).toThrow('was not compiled');
    const game = createGameplay3D({ project, runtime, behaviors: { './jump.ts#update': (context: { pressed: string[] }) => ({ commands: context.pressed.includes('jump') ? [{ type: 'impulse', entityId: 'actor', value: [0, 4, 0] }] : [] }) } });
    game.step(['jump']);const first = runtime.physics.body('actor')!.velocityY;
    game.step(['jump']);expect(runtime.physics.body('actor')!.velocityY).toBeLessThanOrEqual(first);
    expect(runtime.snapshot().entities.find(e => e.id === 'actor')!.position[1]).toBeGreaterThan(0);
    const saved = game.snapshot();game.reset();game.restore(saved);expect(runtime.physics.body('actor')!.velocityY).toBeCloseTo(saved.gameplay!.velocities[0]!.value[1]);
  });
  test('presentation reads selected live poses and velocities without save traversal; projections cannot restore', async () => {
    const { project, assets } = fixture();
    const actor = project.extensions.hyperfocus3D.scenes[0].entities[0];delete actor.controller;
    actor.physics = { type: 'dynamic', shape: 'box', gravityScale: 0, continuous: false };
    project.activeSceneId = 'logic';project.scenes = [{ id: 'logic', entities: [] }];
    const runtime = await createHyperfocus3DRuntime(project, assets);let blockCapture = false;
    const game = createGameplay3D({ project, runtime: { ...runtime, get tick() { return runtime.tick; }, get motionSeed() { return runtime.motionSeed; },
      snapshot() { if (blockCapture) throw Error('Unexpected full scene capture');return runtime.snapshot(); },
      physics: { ...runtime.physics, captureContactState() { if (blockCapture) throw Error('Unexpected contact capture');return runtime.physics.captureContactState(); } },
    } });
    runtime.physics.setVelocity('actor', 1, 2, 3);
    game.advance();const saved = game.snapshot();blockCapture = true;
    const view = game.readPresentation({ entityIds: ['actor'] });
    expect(view.entities).toEqual(saved.entities.filter(entity => entity.id === 'actor'));
    expect(view.gameplay!.velocities).toEqual(saved.gameplay!.velocities);
    expect(view.tick).toBe(saved.tick);expect(view.gameplay!.contacts).toBeUndefined();
    expect(game.readPresentation({ entityIds: [] }).entities).toEqual([]);
    expect(() => game.readPresentation({ entityIds: ['missing'] })).toThrow();
    const completeView = game.readPresentation({ entityIds: ['actor', 'spinner'] });
    expect(isHyperfocus3DSnapshot(completeView)).toBe(false);
    expect(() => game.restore(JSON.parse(JSON.stringify(completeView)))).toThrow('Invalid saved');
    expect(() => runtime.restore(completeView)).toThrow('invalid entity state');
    view.entities[0]!.position[0] = 999;view.gameplay!.velocities[0]!.value[0] = 999;
    blockCapture = false;
    expect(game.snapshot()).toEqual(saved);
    game.advance();game.restore(saved);expect(game.snapshot()).toEqual(saved);
    game.restore({ ...saved, motionSeed: 123 });expect(game.readPresentation({ entityIds: ['actor'] }).motionSeed).toBe(123);
  });

  test("reads a valid declaration before its archive assets are loaded", () => {
    const { project } = fixture();
    expect(readHyperfocus3DDeclaration(project)?.activeSceneId).toBe("level");
    project.extensions.hyperfocus3D.scenes[0].camera.far = 0;
    expect(readHyperfocus3DDeclaration(project)).toBeUndefined();
  });

  test("preserves bounded portable gait analysis on canonical rig clips", () => {
    const project = skinnedFixture(), clip = project.extensions.hyperfocus3D.rigs[0].clips[0];
    clip.gait = { version: 1, cycleSeconds: .8, initialPhase: .25, stanceRatio: .58, confidence: .91, sampleRate: 60, leftFootBoneId: "Hip", rightFootBoneId: "Tip" };
    expect(readHyperfocus3DDeclaration(project)?.rigs?.[0]?.clips[0]?.gait).toEqual(clip.gait);
    clip.gait.confidence = 2;
    expect(readHyperfocus3DDeclaration(project)).toBeUndefined();
  });

  test("cooks canonical glTF/RGBA assets and deterministically moves, animates and restores", async () => {
    const { project, assets } = fixture();
    const runtime = await createHyperfocus3DRuntime(project, assets);
    expect(isHyperfocus3DSnapshot(runtime.snapshot())).toBe(true);
    expect(isHyperfocus3DSnapshot({ ...runtime.snapshot(), tick: -1 })).toBe(false);
    expect(runtime.scene.meshCount).toBe(1);
    expect(runtime.scene.textureCount).toBe(1);
    expect(runtime.compile()).toMatchObject({ instanceCount: 2, lightCount: 2 });
    const initial = runtime.snapshot();
    for (let tick = 0; tick < 60; tick += 1) runtime.step(["move-right"]);
    const moved = runtime.snapshot();
    expect(moved.entities.find((item) => item.id === "actor")!.position[0]).toBeCloseTo(2);
    expect(moved.entities.find((item) => item.id === "spinner")!.rotationY).toBeCloseTo(1);
    expect(runtime.restore(initial)).toEqual(initial);
    expect(runtime.viewProjection(1.7777777777777777)).toHaveLength(16);
  });

  test("renders billboard effects with an engine-owned quad facing the sampled camera", async () => {
    const { project, assets } = fixture();
    project.extensions.hyperfocus3D.scenes[0].effectCapacity = 1;
    project.extensions.hyperfocus3D.scenes[0].camera.position = [3, 4, 7];
    delete project.extensions.hyperfocus3D.scenes[0].camera.followEntityId;
    const runtime = await createHyperfocus3DRuntime(project, assets);
    const timeline: Hyperfocus3DTimeline = {
      version: 2, sceneId: "level", durationFrames: 30, fps: 30, background: "#000000", groups: [], materialTracks: [], shots: [],
      effectCues: [{ id: "spark", kind: "sparks", startFrame: 0, durationFrames: 10, presentation: "billboard", materialId: "surface", count: 1, seed: 1, radius: 0, speed: 0, size: .25 }],
    };
    const frame = sample3DFrame({ declaration: runtime.declaration, clock: { kind: "video", frameIndex: 0, fps: 30 }, viewport: { width: 1920, height: 1080 }, timeline });
    runtime.applyFrame(frame);
    expect(frame.effects[0]).toMatchObject({ id: "spark", presentation: "billboard", materialId: "surface" });
    expect(frame.effects[0]!.meshId).toBeUndefined();
    expect(runtime.scene.meshCount).toBe(2);
    const commands = runtime.compile(), particle = commands.instanceSceneHandles.findIndex((handle) => handle === 2), offset = particle * 16;
    expect([...commands.commandMeshHandles.slice(0, commands.commandCount)]).toContain(1);
    expect(commands).toMatchObject({ instanceCount: 3 });
    const forward = [...commands.instanceMatrices.slice(offset + 8, offset + 11)], length = Math.hypot(...forward);
    for (const [index, value] of forward.entries()) expect(value / length).toBeCloseTo([3, 4, 7][index]! / Math.hypot(3, 4, 7));
  });

  test("reports exact pointers for archive and scene references", async () => {
    const { project, assets } = fixture();
    project.extensions.hyperfocus3D.scenes[0].entities[0].meshId = "missing";
    assets[1].bytes = new Uint8Array(3);
    await expect(createHyperfocus3DRuntime(project, assets)).rejects.toThrow("/extensions/hyperfocus3D/textures/0/assetId");
    await expect(createHyperfocus3DRuntime(project, assets)).rejects.toThrow("/extensions/hyperfocus3D/scenes/0/entities/0/meshId");
  });

  test("does not resolve network glTF buffers", async () => {
    const { project, assets } = fixture();
    project.extensions.hyperfocus3D.meshes[0].buffers[0].uri = "https://example.invalid/mesh.bin";
    await expect(createHyperfocus3DRuntime(project, assets)).rejects.toThrow("safe relative logical name");
  });

  test("loads portable GLB geometry from the canonical asset without sidecar buffers", async () => {
    const { project, assets } = fixture(), document = JSON.parse(new TextDecoder().decode(assets[0]!.bytes));
    delete document.buffers[0].uri; assets[0]!.mimeType = "model/gltf-binary"; assets[0]!.bytes = glb(document, assets[2]!.bytes); project.extensions.hyperfocus3D.meshes[0].buffers = [];
    const runtime = await createHyperfocus3DRuntime(project, assets.slice(0, 2));
    expect(runtime.scene.meshCount).toBe(1); expect(runtime.compile()).toMatchObject({ instanceCount: 2 });
  });

  test("keeps geometry buffer limits independent from the texture byte budget", async () => {
    const { project, assets } = fixture(), document = JSON.parse(new TextDecoder().decode(assets[0]!.bytes));
    const paddedGeometry = new Uint8Array(project.extensions.hyperfocus3D.budgets.textureBytes + 1);
    paddedGeometry.set(assets[2]!.bytes);
    document.buffers[0].byteLength = paddedGeometry.byteLength;
    delete document.buffers[0].uri;
    assets[0]!.mimeType = "model/gltf-binary";
    assets[0]!.bytes = glb(document, paddedGeometry);
    project.extensions.hyperfocus3D.meshes[0].buffers = [];
    const runtime = await createHyperfocus3DRuntime(project, assets.slice(0, 2));
    expect(runtime.scene.meshCount).toBe(1);
    expect(runtime.scene.textureBytes).toBe(16);
  });

  test("does not turn safely ignored standard glTF attributes into runtime blockers", async () => {
    const { project, assets } = fixture(), document = JSON.parse(new TextDecoder().decode(assets[0]!.bytes));
    document.meshes[0].primitives[0].attributes.TANGENT = 1;
    document.meshes[0].primitives[0].attributes.TEXCOORD_1 = 2;
    assets[0]!.bytes = new TextEncoder().encode(JSON.stringify(document));
    const runtime = await createHyperfocus3DRuntime(project, assets);
    expect(runtime.scene.meshCount).toBe(1);
    expect(runtime.diagnostics).toEqual([]);
  });

  test("cooks the standard PBR map set, UV transform, and shader style", async () => {
    const { project, assets } = fixture();
    project.extensions.hyperfocus3D.materials[0] = {
      id: "surface", shading: "lit", shader: "toon", baseColor: [1, 1, 1, 1], emissive: [0.1, 0.2, 0.3], metallic: 0.4, roughness: 0.6, doubleSided: true,
      textureIds: { baseColor: "checker", metallicRoughness: "checker", normal: "checker", occlusion: "checker", emissive: "checker" },
      uv: { offset: [0.25, 0.5], scale: [2, 3], rotation: 0.75 },
    };
    const runtime = await createHyperfocus3DRuntime(project, assets);
    const flags = runtime.scene.materialFlags[0]!;
    expect(flags & MATERIAL_FLAG_SHADER_TOON_3D).toBeTruthy();
    expect(flags & MATERIAL_FLAG_METALLIC_ROUGHNESS_TEXTURED_3D).toBeTruthy();
    expect(flags & MATERIAL_FLAG_NORMAL_TEXTURED_3D).toBeTruthy();
    expect(flags & MATERIAL_FLAG_OCCLUSION_TEXTURED_3D).toBeTruthy();
    expect(flags & MATERIAL_FLAG_EMISSIVE_TEXTURED_3D).toBeTruthy();
    expect(Array.from(runtime.scene.materialTextureHandles.slice(0, MATERIAL_TEXTURE_STRIDE_3D))).toEqual([0, 0, 0, 0, 0]);
    expect(Array.from(runtime.scene.materialData.slice(10, 15))).toEqual([0.25, 0.5, 2, 3, 0.75]);
  });

  test("runs declared first-party rigid bodies inside the portable fixed step", async () => {
    const { project, assets } = fixture();
    const entities = project.extensions.hyperfocus3D.scenes[0].entities;
    entities[0].physics = { type: "dynamic", shape: "box", gravityScale: 1, continuous: false };
    entities.push({ id: "floor", meshId: "triangle", materialId: "surface", position: [0, -1.25, 0], scale: [5, 0.25, 5], rotationY: 0, physics: { type: "static", shape: "box", gravityScale: 0, continuous: false } });
    const runtime = await createHyperfocus3DRuntime(project, assets);
    let contactFrames = 0;
    for (let tick = 0; tick < 120; tick += 1) { runtime.step(["move-right"]); if (runtime.physics.contactCount() > 0) contactFrames += 1; }
    const actor = runtime.snapshot().entities.find((item) => item.id === "actor")!;
    expect(actor.position[0]).toBeGreaterThan(3.5);
    expect(actor.position[1]).toBeGreaterThan(-0.05);
    expect(runtime.physics.diagnostics.steps).toBe(120);
    expect(contactFrames).toBeGreaterThan(0);
  });

  test("cooks a skinned glTF and applies exact-frame performance clips", async () => {
    const source = new Uint8Array(await Bun.file(new URL("../../fixtures/gltf-skin-animation/two-joint.gltf", import.meta.url)).arrayBuffer());
    const project = skinnedFixture();
    const runtime = await createHyperfocus3DRuntime(project, [{ id: "fighter-gltf", mimeType: "model/gltf+json", bytes: source }]);
    expect(runtime.scene.skeletonCount).toBe(1);
    const firstPalette = runtime.scene.skeletonMatrices.slice();
    const timeline: Hyperfocus3DTimeline = {
      version: 2 as const, sceneId: "arena", durationFrames: 60, fps: 30, background: "#000000", groups: [], materialTracks: [], shots: [],
      performanceTracks: [{ entityId: "fighter", rigId: "fighter-rig", segments: [{ id: "wave-a", startFrame: 0, durationFrames: 60, clipId: "wave", sourceStartSeconds: 0, speed: 1, loop: true, blendFrames: 0, rootMotion: { mode: "extract-xyz" as const, loopBoundary: "accumulate" as const, rootBoneId: "Tip" } }] }],
    };
    const frame = sample3DFrame({ declaration: runtime.declaration, clock: { kind: "video", frameIndex: 15, fps: 30 }, viewport: { width: 1920, height: 1080 }, timeline });
    runtime.applyFrame(frame);
    expect(frame.performances).toEqual([{ entityId: "fighter", rigId: "fighter-rig", clipId: "wave", timeSeconds: 0.5, sourceStartSeconds: 0, loop: true, rootMotion: { mode: "extract-xyz", loopBoundary: "accumulate", rootBoneId: "Tip" } }]);
    expect(runtime.scene.transforms.positions[1]).toBeCloseTo(0.5);
    expect(Array.from(runtime.scene.skeletonMatrices)).not.toEqual(Array.from(firstPalette));
    expect(runtime.compile()).toMatchObject({ instanceCount: 1 });
    const correction = { id: "semantic-turn", entityId: "fighter", boneId: "Tip", startFrame: 0, durationFrames: 60, stage: "weighted-layer" as const, weight: 1, translation: tuple3(0, 0, 0), rotationEuler: tuple3(Math.PI / 2, 0, 0), blendInFrames: 0, blendOutFrames: 0 };
    timeline.poseCorrections = [{ ...correction, rotationSpace: "local" }]; runtime.applyFrame(sample3DFrame({ declaration: runtime.declaration, clock: { kind: "video", frameIndex: 15, fps: 30 }, viewport: { width: 1920, height: 1080 }, timeline })); const localAxes = runtime.scene.skeletonMatrices.slice();
    timeline.poseCorrections = [{ ...correction, rotationSpace: "model" }]; const modelFrame = sample3DFrame({ declaration: runtime.declaration, clock: { kind: "video", frameIndex: 15, fps: 30 }, viewport: { width: 1920, height: 1080 }, timeline }); runtime.applyFrame(modelFrame); const modelAxes = runtime.scene.skeletonMatrices.slice();
    expect(modelAxes).not.toEqual(localAxes); runtime.applyFrame(modelFrame); expect(runtime.scene.skeletonMatrices).toEqual(modelAxes);
  });

  test("keeps rig animation output limits independent from the mesh vertex budget", async () => {
    const source = new Uint8Array(await Bun.file(new URL("../../fixtures/gltf-skin-animation/two-joint.gltf", import.meta.url)).arrayBuffer());
    const project = skinnedFixture();
    project.extensions.hyperfocus3D.budgets.vertices = 4;
    const runtime = await createHyperfocus3DRuntime(project, [{ id: "fighter-gltf", mimeType: "model/gltf+json", bytes: source }]);
    expect(runtime.scene.skeletonCount).toBe(1);
  });

  test("accumulates scaled root motion across adjacent clips without playback history", async () => {
    const source = new Uint8Array(await Bun.file(new URL("../../fixtures/gltf-skin-animation/two-joint.gltf", import.meta.url)).arrayBuffer());
    const project = skinnedFixture();
    project.extensions.hyperfocus3D.scenes[0].entities[0].scale = [2, 2, 2];
    const runtime = await createHyperfocus3DRuntime(project, [{ id: "fighter-gltf", mimeType: "model/gltf+json", bytes: source }]);
    const rootMotion = { mode: "extract-xyz" as const, loopBoundary: "accumulate" as const, segmentBoundary: "accumulate" as const, rootBoneId: "Tip" };
    const timeline: Hyperfocus3DTimeline = {
      version: 2, sceneId: "arena", durationFrames: 60, fps: 30, background: "#000000", groups: [], materialTracks: [], shots: [],
      performanceTracks: [{ entityId: "fighter", rigId: "fighter-rig", segments: [
        { id: "travel-a", startFrame: 0, durationFrames: 30, clipId: "wave", sourceStartSeconds: 0, speed: 1, loop: true, blendFrames: 0, transition: "cut", rootMotion },
        { id: "travel-b", startFrame: 30, durationFrames: 30, clipId: "wave", sourceStartSeconds: .25, speed: 1, loop: true, blendFrames: 6, transition: "blend", rootMotion },
      ] }],
    };
    const frame = (frameIndex: number) => sample3DFrame({ declaration: runtime.declaration, clock: { kind: "video", frameIndex, fps: 30 }, viewport: { width: 1920, height: 1080 }, timeline });
    const boundary = frame(30), arbitrary = frame(45);
    expect(arbitrary.performances[0]!.rootMotion?.carry).toEqual([{ clipId: "wave", sourceStartSeconds: 0, timeSeconds: 1, loop: true, rootMotion }]);
    runtime.applyFrame(arbitrary); const firstArbitrary = runtime.scene.transforms.positions[1]!;
    runtime.applyFrame(boundary); expect(runtime.scene.transforms.positions[1]).toBeCloseTo(2);
    runtime.applyFrame(arbitrary); expect(runtime.scene.transforms.positions[1]).toBeCloseTo(firstArbitrary); expect(firstArbitrary).toBeCloseTo(3);
    for (const segment of timeline.performanceTracks![0]!.segments) segment.rootMotion!.mode = "extract-xz";
    runtime.applyFrame(frame(45)); expect(runtime.scene.transforms.positions[1]).toBeCloseTo(0); expect(runtime.scene.skeletonMatrices[28]).toBeCloseTo(.25);
    for (const segment of timeline.performanceTracks![0]!.segments) segment.rootMotion!.mode = "extract-xyz";
    timeline.performanceTracks![0]!.segments[1]!.rootMotion!.segmentBoundary = "reset";
    runtime.applyFrame(frame(45)); expect(runtime.scene.transforms.positions[1]).toBeCloseTo(1);
  });

  test("feeds extracted clip travel into the shared rigid performance instead of offsetting the render transform twice", async () => {
    const source = new Uint8Array(await Bun.file(new URL("../../fixtures/gltf-skin-animation/two-joint.gltf", import.meta.url)).arrayBuffer());
    const runtime = await createHyperfocus3DRuntime(skinnedFixture(), [{ id: "fighter-gltf", mimeType: "model/gltf+json", bytes: source }]);
    const simulation = {
      frameRate: 30, simulationHz: 120, durationFrames: 30, world: { gravityY: 0, velocityIterations: 8 }, cues: [],
      bodies: [{ id: "ceiling", type: "static" as const, shape: { kind: "box" as const, halfX: 2, halfY: .05, halfZ: 2 }, y: .65, collisionLayer: 4, collisionMask: 2 }],
      ragdolls: [{ id: "fighter-body", rootBoneId: "Tip", bodies: [{ boneId: "Tip", body: { shape: { kind: "sphere" as const, radius: .1 }, mass: 2, collisionLayer: 2, collisionMask: 4 } }], joints: [], initialPose: { rotations: [] }, maxRootImpulse: 100 }],
      outputs: [{ ragdollId: "fighter-body", boneId: "Tip" }],
    };
    const timeline: Hyperfocus3DTimeline = {
      version: 2, sceneId: "arena", durationFrames: 30, fps: 30, background: "#000000", groups: [], materialTracks: [], shots: [],
      performanceTracks: [{ entityId: "fighter", rigId: "fighter-rig", segments: [{ id: "travel", startFrame: 0, durationFrames: 30, clipId: "wave", sourceStartSeconds: 0, speed: 1, loop: true, blendFrames: 0, transition: "cut", rootMotion: { mode: "extract-xyz", authority: "physical", loopBoundary: "accumulate", segmentBoundary: "accumulate", rootBoneId: "Tip" } }] }],
      physicalPerformance: { simulation, bindings: [{ reference: { ragdollId: "fighter-body", boneId: "Tip" }, entityId: "fighter", positionOffset: [0, 0, 0], rotationOffset: [0, 0, 0, 1] }] },
    };
    const compiled = runtime.compilePhysicalPerformance(timeline)!, replay = runtime.compilePhysicalPerformance(timeline)!;
    expect(compiled.states).toEqual(replay.states);
    const finalOffset = 29 * compiled.frameStride, physicalY = compiled.states[finalOffset + 1]!;
    expect(physicalY).toBeGreaterThan(.25); expect(physicalY).toBeLessThanOrEqual(.501);
    const frame = sample3DFrame({ declaration: runtime.declaration, timeline, physicalPerformance: compiled, clock: { kind: "video", frameIndex: 29, fps: 30 }, viewport: { width: 1920, height: 1080 } });
    runtime.applyFrame(frame);
    expect(runtime.scene.transforms.positions[1]).toBeCloseTo(physicalY, 5);
    const actionTimeline = structuredClone(timeline);
    actionTimeline.physicalPerformance!.simulation.cues = [{ id: "sidestep", kind: "launch", frame: 10, attacker: { ragdollId: "fighter-body", boneId: "Tip" }, direction: [1, 0, 0], speedMetersPerSecond: 2, distanceMeters: .2 }];
    const action = runtime.compilePhysicalPerformance(actionTimeline)!, actionReplay = runtime.compilePhysicalPerformance(actionTimeline)!;
    expect(action.states).toEqual(actionReplay.states);
    expect(action.diagnostics.filter((item) => item.code === "root-motion-action-conflict")).toEqual([expect.objectContaining({ cueId: "travel", frame: 10, pointer: "/extensions/hyperfocus3DVideo/performanceTracks/0/segments/0/rootMotion/authority" })]);
  });

  test("applies compiled ragdoll bodies to the same cooked skeleton used by normal playback", async () => {
    const source = new Uint8Array(await Bun.file(new URL("../../fixtures/gltf-skin-animation/two-joint.gltf", import.meta.url)).arrayBuffer());
    const runtime = await createHyperfocus3DRuntime(skinnedFixture(), [{ id: "fighter-gltf", mimeType: "model/gltf+json", bytes: source }]);
    const simulation = {
      frameRate: 30, simulationHz: 120, durationFrames: 2, world: { gravityY: 0 }, cues: [],
      ragdolls: [{ id: "fighter-body", rootBoneId: "Tip", bodies: [{ boneId: "Tip", body: { shape: { kind: "sphere" as const, radius: 0.2 }, x: 2, y: 3, z: 4 } }], joints: [], initialPose: { rotations: [] } }],
    };
    const timeline: Hyperfocus3DTimeline = {
      version: 2, sceneId: "arena", durationFrames: 2, fps: 30, background: "#000000", groups: [], materialTracks: [], shots: [],
      physicalPerformance: { simulation, bindings: [{ reference: { ragdollId: "fighter-body", boneId: "Tip" }, entityId: "fighter", boneId: "Tip", positionOffset: [0, 0, 0], rotationOffset: [0, 0, 0, 1] }] },
    };
    const compiled = compilePhysicalPerformance3D({ performance: simulation });
    const before = runtime.scene.skeletonMatrices.slice();
    const frame = sample3DFrame({ declaration: runtime.declaration, clock: { kind: "video", frameIndex: 0, fps: 30 }, viewport: { width: 1920, height: 1080 }, timeline, physicalPerformance: compiled });
    runtime.applyFrame(frame);
    expect(frame.physicalBodies).toEqual([{ entityId: "fighter", boneId: "Tip", position: [2, 3, 4], rotation: [0, 0, 0, 1] }]);
    expect(runtime.scene.skeletonMatrices).not.toEqual(before);
    expect([...runtime.scene.skeletonMatrices.slice(28, 31)]).toEqual([2, 3, 4]);
  });

  test("feeds portable IK corrections into the same active-ragdoll motor targets deterministically", async () => {
    const gltf = JSON.parse(await Bun.file(new URL("../../fixtures/gltf-skin-animation/two-joint.gltf", import.meta.url)).text()); gltf.nodes[2].children = [4]; gltf.nodes.push({ name: "Hand", translation: [0, 1, 0] });
    const source = new TextEncoder().encode(JSON.stringify(gltf)), project = skinnedFixture(); project.extensions.hyperfocus3D.rigs[0].bones.push({ id: "Hand", node: 4, parentId: "Tip" });
    const runtime = await createHyperfocus3DRuntime(project, [{ id: "fighter-gltf", mimeType: "model/gltf+json", bytes: source }]);
    const simulation = {
      frameRate: 30, simulationHz: 120, durationFrames: 12, world: { gravityY: 0, constraintIterations: 12 }, cues: [],
      ragdolls: [{
        id: "fighter-body", rootBoneId: "Hip",
        bodies: [
          { boneId: "Hip", body: { shape: { kind: "sphere" as const, radius: .08 }, x: 1, y: 0, mass: 4, collisionLayer: 2, collisionMask: 0 } },
          { boneId: "Tip", body: { shape: { kind: "sphere" as const, radius: .08 }, x: 1, y: 1, mass: 2, collisionLayer: 2, collisionMask: 0 } },
          { boneId: "Hand", body: { shape: { kind: "sphere" as const, radius: .08 }, x: 1, y: 2, mass: 1, collisionLayer: 2, collisionMask: 0 } },
        ],
        joints: [
          { id: "hip-tip", parentBoneId: "Hip", childBoneId: "Tip", poseJointIndex: 1, localAnchorParent: [0, 1, 0], maxTorqueImpulse: 20 },
          { id: "tip-hand", parentBoneId: "Tip", childBoneId: "Hand", poseJointIndex: 0, localAnchorParent: [0, 1, 0], maxTorqueImpulse: 20 },
        ],
        initialPose: { rotations: [0, 0, 0, 1, 0, 0, 0, 1] },
      }],
    };
    const timeline = (ikCorrections: Hyperfocus3DTimeline["ikCorrections"]): Hyperfocus3DTimeline => ({
      version: 2, sceneId: "arena", durationFrames: 12, fps: 30, background: "#000000", groups: [], materialTracks: [], shots: [],
      performanceTracks: [{ entityId: "fighter", rigId: "fighter-rig", segments: [{ id: "wave", startFrame: 0, durationFrames: 12, clipId: "wave", sourceStartSeconds: .25, speed: 1, loop: true, blendFrames: 0 }] }],
      ikCorrections,
      physicalPerformance: { simulation, bindings: [{ reference: { ragdollId: "fighter-body", boneId: "Hip" }, entityId: "fighter", positionOffset: [0, 0, 0], rotationOffset: [0, 0, 0, 1] }] },
    });
    const correctedTimeline = timeline([{ id: "reach", entityId: "fighter", startFrame: 0, durationFrames: 12, rootBoneId: "Hip", middleBoneId: "Tip", endBoneId: "Hand", targetFrom: [1, 2, 0], target: [2, 1, 0], targetTo: [2.5, .5, 0], contactFrame: 5, pole: [0, 0, 1], weight: 1, maxStretch: 1, blendInFrames: 3, blendOutFrames: 3, interpolation: "smooth" }]);
    const prefix = runtime.compilePhysicalPerformance(correctedTimeline, { throughFrame: 5 })!;
    expect(prefix.compiledThroughFrame).toBe(5);
    const corrected = runtime.compilePhysicalPerformance(correctedTimeline)!, replay = runtime.compilePhysicalPerformance(correctedTimeline)!, baseline = runtime.compilePhysicalPerformance(timeline([]))!;
    expect(prefix.states.slice(0, 6 * prefix.frameStride)).toEqual(corrected.states.slice(0, 6 * corrected.frameStride));
    prefix.ensureComplete(); expect(prefix.states).toEqual(corrected.states);
    expect(corrected.states).toEqual(replay.states); expect(corrected.states).not.toEqual(baseline.states);
    expect([...corrected.states.slice(0, corrected.frameStride)]).toEqual([...baseline.states.slice(0, baseline.frameStride)]);
    const contact = 5 * corrected.frameStride, tipRotation = 29, last = (corrected.durationFrames - 1) * corrected.frameStride + tipRotation;
    expect([...corrected.states.slice(contact, contact + corrected.frameStride)]).not.toEqual([...baseline.states.slice(contact, contact + baseline.frameStride)]);
    expect([...corrected.states.slice(last, last + 4)]).not.toEqual([...baseline.states.slice(last, last + 4)]);
    const initialSimulation: typeof simulation & { ragdolls: Array<(typeof simulation.ragdolls)[number] & { motorPoseSource?: "performance" | "initial" }> } = structuredClone(simulation); initialSimulation.ragdolls[0]!.motorPoseSource = "initial";
    const physicsAuthoredTimeline = correctedTimeline; physicsAuthoredTimeline.physicalPerformance!.simulation = initialSimulation;
    const physicsAuthored = runtime.compilePhysicalPerformance(physicsAuthoredTimeline)!, directPhysicsAuthored = compilePhysicalPerformance3D({ performance: initialSimulation });
    expect(physicsAuthored.states).toEqual(directPhysicsAuthored.states);
    expect(physicsAuthored.diagnostics).toEqual(directPhysicsAuthored.diagnostics);
    const lateTimeline = timeline([{ id: "late-reach", entityId: "fighter", startFrame: 8, durationFrames: 4, rootBoneId: "Hip", middleBoneId: "Tip", endBoneId: "Hand", targetFrom: [1, 2, 0], target: [2, 1, 0], targetTo: [2.5, .5, 0], contactFrame: 9, pole: [0, 0, 1], weight: 1, maxStretch: 1, blendInFrames: 1, blendOutFrames: 1, interpolation: "smooth" }]);
    const beforeLateEdit = runtime.compilePhysicalPerformance(timeline([]), { throughFrame: 7, checkpointIntervalFrames: 4 })!, resume = beforeLateEdit.resumePointBefore(8);
    expect(resume.checkpoint.frame).toBe(7);
    const resumedLate = runtime.compilePhysicalPerformance(lateTimeline, { resumeFrom: resume, checkpointIntervalFrames: 4 })!, fullLate = runtime.compilePhysicalPerformance(lateTimeline)!;
    expect(resumedLate.resumedFromFrame).toBe(7); expect(resumedLate.states).toEqual(fullLate.states); expect(resumedLate.diagnostics).toEqual(fullLate.diagnostics);
    const deferred = runtime.compilePhysicalPerformance(correctedTimeline, { defer: true })!;
    expect(deferred.compiledThroughFrame).toBe(-1);
    expect(deferred.advance({ throughFrame: 0, maximumFrames: 1 }).done).toBe(true);
    expect(deferred.compiledThroughFrame).toBe(0);
  });
});

function skinnedFixture(): any {
  return { extensions: { hyperfocus3D: {
    version: 1, activeSceneId: "arena",
    budgets: { meshes: 2, vertices: 100, indices: 300, textures: 1, textureBytes: 65_536, materials: 2, lights: 2, entities: 2 },
    meshes: [{ id: "fighter-mesh", assetId: "fighter-gltf", primitive: 0, buffers: [], skin: { rigId: "fighter-rig", meshIndex: 0, primitiveIndex: 0 } }],
    rigs: [{ id: "fighter-rig", meshId: "fighter-mesh", clips: [{ id: "wave", animation: 0, durationSeconds: 1 }], bones: [{ id: "Hip", node: 1, parentId: "RigRoot" }, { id: "Tip", node: 2, parentId: "Hip" }, { id: "RigRoot", node: 0 }], rootBoneId: "Tip" }],
    textures: [],
    materials: [{ id: "fighter-surface", shading: "lit", baseColor: [0.35, 0.8, 0.25, 1], metallic: 0, roughness: 0.7, doubleSided: true }],
    scenes: [{
      id: "arena", camera: { position: [0, 2, 5], target: [0, 1, 0], up: [0, 1, 0], fovYRadians: 1, near: 0.1, far: 100 },
      lights: [{ id: "ambient", kind: "ambient", color: [1, 1, 1], intensity: 0.5 }],
      entities: [{ id: "fighter", meshId: "fighter-mesh", materialId: "fighter-surface", position: [0, 0, 0], scale: [1, 1, 1], rotationY: 0, skeleton: { rigId: "fighter-rig", skinIndex: 0, meshNode: 3 } }],
    }],
    audio: { policy: "disabled", cues: [] }, save: { restoreOnBoot: true, slot: "auto", maxBytes: 65_536 },
  } } };
}

function fixture(): { project: any; assets: PortableAsset3D[] } {
  const positions = new Float32Array([-0.5, 0, 0, 0.5, 0, 0, 0, 1, 0]);
  const normals = new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]);
  const uvs = new Float32Array([0, 0, 1, 0, 0.5, 1]);
  const indices = new Uint16Array([0, 1, 2]);
  const bytes = new Uint8Array(positions.byteLength + normals.byteLength + uvs.byteLength + indices.byteLength);
  let offset = 0;
  for (const source of [new Uint8Array(positions.buffer), new Uint8Array(normals.buffer), new Uint8Array(uvs.buffer), new Uint8Array(indices.buffer)]) { bytes.set(source, offset); offset += source.byteLength; }
  const gltf = {
    asset: { version: "2.0" }, buffers: [{ uri: "mesh.bin", byteLength: bytes.byteLength }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positions.byteLength },
      { buffer: 0, byteOffset: positions.byteLength, byteLength: normals.byteLength },
      { buffer: 0, byteOffset: positions.byteLength + normals.byteLength, byteLength: uvs.byteLength },
      { buffer: 0, byteOffset: positions.byteLength + normals.byteLength + uvs.byteLength, byteLength: indices.byteLength },
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: "VEC3" },
      { bufferView: 1, componentType: 5126, count: 3, type: "VEC3" },
      { bufferView: 2, componentType: 5126, count: 3, type: "VEC2" },
      { bufferView: 3, componentType: 5123, count: 3, type: "SCALAR" },
    ],
    meshes: [{ name: "triangle", primitives: [{ attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 }, indices: 3, mode: 4 }] }],
  };
  const extension = {
    version: 1, activeSceneId: "level",
    budgets: { meshes: 4, vertices: 100, indices: 300, textures: 4, textureBytes: 1024, materials: 4, lights: 4, entities: 8 },
    meshes: [{ id: "triangle", assetId: "gltf", primitive: 0, buffers: [{ uri: "mesh.bin", assetId: "bin" }] }],
    textures: [{ id: "checker", assetId: "rgba", width: 2, height: 2, filter: "nearest", wrap: "repeat", flipY: false }],
    materials: [{ id: "surface", shading: "lit", baseColor: [1, 1, 1, 1], textureId: "checker", metallic: 0, roughness: 1, doubleSided: true }],
    scenes: [{ id: "level", camera: { position: [0, 4, 7], target: [0, 0, 0], up: [0, 1, 0], fovYRadians: 1, near: 0.1, far: 100, followEntityId: "actor", followOffset: [0, 4, 7] }, lights: [{ id: "ambient", kind: "ambient", color: [1, 1, 1], intensity: 0.4 }, { id: "sun", kind: "directional", color: [1, 0.9, 0.8], intensity: 0.8, direction: [-1, -2, -1] }], entities: [{ id: "actor", meshId: "triangle", materialId: "surface", position: [0, 0, 0], scale: [1, 1, 1], rotationY: 0, controller: { speed: 2 } }, { id: "spinner", meshId: "triangle", materialId: "surface", position: [2, 0, 0], scale: [1, 1, 1], rotationY: 0, animation: { kind: "rotate-y", radiansPerSecond: 1 } }] }],
    audio: { policy: "gesture-unlock", cues: [] }, save: { restoreOnBoot: true, slot: "auto", maxBytes: 65536 },
  };
  return { project: { extensions: { hyperfocus3D: extension } }, assets: [{ id: "gltf", mimeType: "model/gltf+json", bytes: new TextEncoder().encode(JSON.stringify(gltf)) }, { id: "rgba", mimeType: "application/octet-stream", bytes: new Uint8Array([255, 80, 40, 255, 40, 255, 170, 255, 30, 60, 160, 255, 255, 220, 80, 255]) }, { id: "bin", mimeType: "application/octet-stream", bytes }] };
}

function glb(document: unknown, binary: Uint8Array): Uint8Array {
  const json = new TextEncoder().encode(JSON.stringify(document)), jsonLength = Math.ceil(json.length / 4) * 4, binaryLength = Math.ceil(binary.length / 4) * 4;
  const output = new Uint8Array(20 + jsonLength + 8 + binaryLength), view = new DataView(output.buffer); view.setUint32(0, 0x46546c67, true); view.setUint32(4, 2, true); view.setUint32(8, output.length, true); view.setUint32(12, jsonLength, true); view.setUint32(16, 0x4e4f534a, true); output.fill(0x20, 20, 20 + jsonLength); output.set(json, 20); const offset = 20 + jsonLength; view.setUint32(offset, binaryLength, true); view.setUint32(offset + 4, 0x004e4942, true); output.set(Array.from(binary), offset + 8); return output;
}


test('diagnostic ablations pause physics and scenery independently and resume without mutating defaults', async () => {
  const { project, assets } = fixture();
  project.extensions.hyperfocus3D.scenes[0].entities[0].physics = { type: 'dynamic', shape: 'box', gravityScale: 1, continuous: false };
  const runtime = await createHyperfocus3DRuntime(project, assets);
  runtime.setDiagnosticFeatures({ mainPhysics: false, environmentMotion: false });
  for (let i = 0; i < 10; i++) runtime.step([]);
  expect(runtime.physics.diagnostics.steps).toBe(0);
  expect(runtime.snapshot().entities.find(entity => entity.id === 'spinner')!.rotationY).toBe(0);
  runtime.setDiagnosticFeatures({ mainPhysics: true, environmentMotion: true });
  for (let i = 0; i < 10; i++) runtime.step([]);
  expect(runtime.physics.diagnostics.steps).toBe(10);
  expect(runtime.snapshot().entities.find(entity => entity.id === 'spinner')!.rotationY).toBeGreaterThan(0);
  expect((await createHyperfocus3DRuntime(project, assets)).diagnosticFeatures.mainPhysics).toBe(true);
});
