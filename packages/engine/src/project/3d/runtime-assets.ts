import { hypot } from '../../math/simulation.ts';
import { parseGltfContainer, resolveAndCookGltfStaticMeshes, type CookedGltfStaticMesh } from "../../assets/gltf-static.ts";
import { resolveAndCookGltfSkinAnimations, inspectGltfRigRestPose, type CookedGltfRig } from "../../assets/gltf-skin-animation.ts";
import { error, message, preflightFailure, type Hyperfocus3DDeclaration, type Hyperfocus3DDiagnostic, type PortableAsset3D } from "./declaration.ts";

const MAX_GLB_ASSET_BYTES = 268435456;

/** Cooks each distinct source/options graph once per runtime. Asset bytes are borrowed
 * immutable until this promise settles; cooked arrays remain immutable for scene lifetime.
 * Declaration budgets still count each registered mesh, including repeated sources. */
export async function cookRuntimeAssets3D(options: { declaration: Hyperfocus3DDeclaration; assets: readonly PortableAsset3D[]; diagnostics: Hyperfocus3DDiagnostic[] }) {
  const { declaration, assets, diagnostics } = options;
  const assetById = new Map(assets.map((asset) => [asset.id, asset]));
  const cookedById = new Map<string, CookedGltfStaticMesh>();
  const sourceByMeshId = new Map<string, { key: string; document: unknown; embeddedBuffers: ReadonlyMap<number, Uint8Array>; buffers: Map<string, PortableAsset3D> }>();
  const containers = new Map<PortableAsset3D, ReturnType<typeof parseGltfContainer>>();
  const meshResults = new Map<string, Awaited<ReturnType<typeof resolveAndCookGltfStaticMeshes>>>();
  const rigResults = new Map<string, Awaited<ReturnType<typeof resolveAndCookGltfSkinAnimations>>>();
  const work = { containerParses: 0, meshCooks: 0, rigCooks: 0 };
  let vertexCount = 0, indexCount = 0;
  for (let index = 0; index < declaration.meshes.length; index += 1) {
    const mesh = declaration.meshes[index];
    const source = requireMapValue(assetById, mesh.assetId, `3D mesh asset ${mesh.assetId}`);
    let document: unknown, embeddedBuffers: ReadonlyMap<number, Uint8Array>;
    try {
      let container = containers.get(source);
      if (!container) { work.containerParses++;container = parseGltfContainer(source.bytes);containers.set(source, container); }
      document = container.document;embeddedBuffers = container.embeddedBuffers;
    }
    catch (cause) {
      diagnostics.push(error("gltf-container", `/extensions/hyperfocus3D/meshes/${index}/assetId`, `Asset ${mesh.assetId} is not valid glTF/GLB: ${message(cause)}`));
      continue;
    }
    const bufferMap = new Map<string, PortableAsset3D>();
    for (const item of mesh.buffers) {
      bufferMap.set(item.uri, requireMapValue(assetById, item.assetId, `3D buffer asset ${item.assetId}`));
    }
    // The canonical asset map is fixed for this invocation. URI mappings and skin
    // admission affect cooking; declaration id and selected primitive do not.
    const key = JSON.stringify([source.id, [...bufferMap].map(([uri, asset]) => [uri, asset.id]).sort(([a], [b]) => a!.localeCompare(b!)), mesh.skin !== undefined]);
    sourceByMeshId.set(mesh.id, { key, document, embeddedBuffers, buffers: bufferMap });
    let cooked = meshResults.get(key);
    if (!cooked) {
      work.meshCooks++;
      cooked = await resolveAndCookGltfStaticMeshes(document, {
      embeddedBuffers,
      maxBuffers: 64,
      maxBufferBytes: MAX_GLB_ASSET_BYTES,
      resolveExternal: ({ uri }) => {
        const resolved = bufferMap.get(uri);
        if (!resolved) throw new Error(`URI ${JSON.stringify(uri)} is not mapped to a canonical archive asset.`);
        return resolved.bytes;
      },
      cook: { maxMeshes: declaration.budgets.meshes, maxPrimitives: declaration.budgets.meshes, maxVertices: declaration.budgets.vertices, maxIndices: declaration.budgets.indices, maxOutputBytes: declaration.budgets.vertices * 32 + declaration.budgets.indices * 4, allowSkinAttributes: mesh.skin !== undefined },
      });
      meshResults.set(key, cooked);
    }
    for (const item of cooked.diagnostics) {
      if (item.severity === "error") diagnostics.push(error(`gltf-${item.code}`, `/extensions/hyperfocus3D/meshes/${index}/asset${item.pointer}`, item.message));
    }
    if (!cooked.ok) continue;
    const primitive = cooked.meshes[mesh.primitive];
    if (!primitive) {
      diagnostics.push(error("mesh-primitive", `/extensions/hyperfocus3D/meshes/${index}/primitive`, `Cooked glTF has ${cooked.meshes.length} primitives; index ${mesh.primitive} does not exist.`));
      continue;
    }
    vertexCount += primitive.positions.length / 3;
    indexCount += primitive.indices.length;
    if (vertexCount > declaration.budgets.vertices) diagnostics.push(error("vertex-budget", "/extensions/hyperfocus3D/budgets/vertices", `Cooked vertex count ${vertexCount} exceeds budget ${declaration.budgets.vertices}.`));
    if (indexCount > declaration.budgets.indices) diagnostics.push(error("index-budget", "/extensions/hyperfocus3D/budgets/indices", `Cooked index count ${indexCount} exceeds budget ${declaration.budgets.indices}.`));
    cookedById.set(mesh.id, primitive);
  }
  const rigById = new Map<string, CookedGltfRig>();
  for (let index = 0; index < (declaration.rigs?.length ?? 0); index += 1) {
    const rig = declaration.rigs![index]!;
    const source = requireMapValue(sourceByMeshId, rig.meshId, `3D rig mesh ${rig.meshId}`);
    let cooked = rigResults.get(source.key);
    if (!cooked) {
      work.rigCooks++;
      cooked = await resolveAndCookGltfSkinAnimations(source.document, {
      embeddedBuffers: source.embeddedBuffers,
      maxBuffers: 64,
      maxBufferBytes: MAX_GLB_ASSET_BYTES,
      resolveExternal: ({ uri }) => {
        const resolved = source.buffers.get(uri);
        if (!resolved) throw new Error(`URI ${JSON.stringify(uri)} is not mapped to a canonical archive asset.`);
        return resolved.bytes;
      },
      cook: {
        maxMeshes: declaration.budgets.meshes,
        maxPrimitives: declaration.budgets.meshes,
        maxVertices: declaration.budgets.vertices,
        maxJointsPerSkin: 256,
        maxAnimations: 1_024,
      },
      });
      rigResults.set(source.key, cooked);
    }
    for (const item of cooked.diagnostics) diagnostics.push(error(`gltf-rig-${item.code}`, `/extensions/hyperfocus3D/rigs/${index}/meshId${item.pointer}`, item.message));
    if (!cooked.ok || !cooked.rig) continue;
    const cookedRest = rig.bones?.some((bone) => bone.restPosition || bone.restRotation) ? inspectGltfRigRestPose(cooked.rig) : undefined;
    for (let boneIndex = 0; boneIndex < (rig.bones?.length ?? 0); boneIndex += 1) {
      const bone = rig.bones![boneIndex]!;
      if (cooked.rig.nodeIds[bone.node] !== bone.id) diagnostics.push(error("rig-bone-identity", `/extensions/hyperfocus3D/rigs/${index}/bones/${boneIndex}`, `Declared stable bone ${bone.id} at node ${bone.node} does not match cooked node ${cooked.rig.nodeIds[bone.node] ?? "missing"}.`));
      const actualParent = cooked.rig.nodeParents[bone.node]! < 0 ? undefined : cooked.rig.nodeIds[cooked.rig.nodeParents[bone.node]!]; if (bone.parentId !== actualParent) diagnostics.push(error("rig-bone-parent", `/extensions/hyperfocus3D/rigs/${index}/bones/${boneIndex}/parentId`, `Declared parent ${bone.parentId ?? "none"} does not match cooked parent ${actualParent ?? "none"} for ${bone.id}.`));
      if (bone.restPosition && cookedRest) { const offset = bone.node * 3, errorDistance = hypot(bone.restPosition[0] - cookedRest.positions[offset]!, bone.restPosition[1] - cookedRest.positions[offset + 1]!, bone.restPosition[2] - cookedRest.positions[offset + 2]!); if (errorDistance > .0001) diagnostics.push(error("rig-bone-rest-position", `/extensions/hyperfocus3D/rigs/${index}/bones/${boneIndex}/restPosition`, `Captured rest position for ${bone.id} no longer matches the cooked source rig. Reinspect and bind the rig.`)); }
      if (bone.restRotation && cookedRest) { const offset = bone.node * 4, dot = Math.abs(bone.restRotation[0] * cookedRest.rotations[offset]! + bone.restRotation[1] * cookedRest.rotations[offset + 1]! + bone.restRotation[2] * cookedRest.rotations[offset + 2]! + bone.restRotation[3] * cookedRest.rotations[offset + 3]!); if (1 - dot > .0001) diagnostics.push(error("rig-bone-rest-rotation", `/extensions/hyperfocus3D/rigs/${index}/bones/${boneIndex}/restRotation`, `Captured rest rotation for ${bone.id} no longer matches the cooked source rig. Reinspect and bind the rig.`)); }
    }
    for (let clipIndex = 0; clipIndex < rig.clips.length; clipIndex += 1) {
      const declared = rig.clips[clipIndex]!, actual = cooked.rig.clips[declared.animation];
      if (!actual) diagnostics.push(error("rig-clip-index", `/extensions/hyperfocus3D/rigs/${index}/clips/${clipIndex}/animation`, `Rig ${rig.id} has no animation ${declared.animation}.`));
      else {
        if (Math.abs(actual.duration - declared.durationSeconds) > 0.001) diagnostics.push(error("rig-clip-duration", `/extensions/hyperfocus3D/rigs/${index}/clips/${clipIndex}/durationSeconds`, `Declared duration ${declared.durationSeconds} does not match cooked duration ${actual.duration}.`));
        if (declared.sourceName !== undefined && actual.label !== declared.sourceName) diagnostics.push(error("rig-clip-source-name", `/extensions/hyperfocus3D/rigs/${index}/clips/${clipIndex}/sourceName`, `Declared source clip ${JSON.stringify(declared.sourceName)} resolves to ${JSON.stringify(actual.label)}. Select ${JSON.stringify(actual.label)} or rebind the rig.`));
      }
    }
    rigById.set(rig.id, cooked.rig);
  }
  if (diagnostics.length) throw preflightFailure(diagnostics);

  return { assetById, cookedById, rigById, work };
}

export function requireMapValue<K, V>(map: ReadonlyMap<K, V>, key: K, label: string): V {
  const value = map.get(key);
  if (value === undefined) throw new Error(`${label} is missing.`);
  return value;
}
