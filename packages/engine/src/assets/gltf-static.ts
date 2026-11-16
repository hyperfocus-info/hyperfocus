import { compareText } from "@hyperfocus/utilities/text";
import { errorMessage } from "@hyperfocus/utilities/text";
import { isPlainRecord as isJsonRecord } from "@hyperfocus/utilities/records";
/** Provider-neutral glTF 2.0 static-mesh cooking. This module performs no I/O. */

const GLTF_FLOAT = 5126;
const GLTF_BYTE = 5120;
const GLTF_UNSIGNED_BYTE = 5121;
const GLTF_SHORT = 5122;
const GLTF_UNSIGNED_SHORT = 5123;
const GLTF_UNSIGNED_INT = 5125;
const GLTF_TRIANGLES = 4;
const GLB_MAGIC = 0x46546c67;
const GLB_JSON_CHUNK = 0x4e4f534a;
const GLB_BINARY_CHUNK = 0x004e4942;

const DEFAULT_LIMITS = {
  maxBuffers: 64,
  maxBufferBytes: 268435456,
  maxBufferViews: 100_000,
  maxAccessors: 100_000,
  maxMeshes: 10_000,
  maxPrimitives: 50_000,
  maxVertices: 10_000_000,
  maxIndices: 30_000_000,
  maxOutputBytes: 536870912,
} as const;

const HARD_LIMITS = {
  maxBuffers: 1_024,
  maxBufferBytes: 1073741824,
  maxBufferViews: 1_000_000,
  maxAccessors: 1_000_000,
  maxMeshes: 100_000,
  maxPrimitives: 1_000_000,
  maxVertices: 100_000_000,
  maxIndices: 300_000_000,
  maxOutputBytes: 1073741824,
} as const;

export type GltfStaticDiagnostic = {
  severity: "error" | "warning";
  code: string;
  pointer: string;
  message: string;
};

export type GltfStaticBounds = {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
  x: number;
  y: number;
  z: number;
  radius: number;
};

export type CookedGltfStaticMesh = {
  meshIndex: number;
  primitiveIndex: number;
  label: string;
  material?: number;
  positions: Float32Array;
  normals?: Float32Array;
  uvs?: Float32Array;
  morphPositions?: Float32Array[];
  morphWeights?: Float32Array;
  indices: Uint16Array | Uint32Array;
  topology: "triangle-list";
  bounds: GltfStaticBounds;
};

export type GltfStaticCookLimits = { [Key in keyof typeof DEFAULT_LIMITS]?: number };
export type GltfStaticCookOptions = GltfStaticCookLimits & {
  /** Permit JOINTS/WEIGHTS attributes when a separate skin cooker owns those streams. */
  allowSkinAttributes?: boolean;
};

export type GltfStaticCookResult = {
  ok: boolean;
  meshes: CookedGltfStaticMesh[];
  diagnostics: GltfStaticDiagnostic[];
  outputBytes: number;
};

export type GltfExternalBufferRequest = {
  index: number;
  uri: string;
  declaredByteLength: number;
  pointer: string;
};

export type GltfBufferResolverOptions = {
  embeddedBuffers?: ReadonlyMap<number, ArrayBuffer | ArrayBufferView> | readonly (ArrayBuffer | ArrayBufferView | undefined)[];
  resolveExternal?: (request: GltfExternalBufferRequest) => ArrayBuffer | ArrayBufferView | Promise<ArrayBuffer | ArrayBufferView>;
  maxBuffers?: number;
  maxBufferBytes?: number;
};

export type GltfBufferResolutionResult = {
  ok: boolean;
  buffers: Uint8Array[];
  diagnostics: GltfStaticDiagnostic[];
  totalBytes: number;
};

export type ParsedGltfContainer = { document: unknown; embeddedBuffers: ReadonlyMap<number, Uint8Array>; kind: "gltf" | "glb" };

/** Parses UTF-8 glTF JSON or a GLB 2.0 container without filesystem, DOM, or network access. */
export function parseGltfContainer(bytes: Uint8Array): ParsedGltfContainer {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < 4) throw new Error("glTF asset is too short.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== GLB_MAGIC) return { document: parseGltfJson(bytes), embeddedBuffers: new Map(), kind: "gltf" };
  if (bytes.byteLength < 20) throw new Error("GLB header and JSON chunk are incomplete.");
  const version = view.getUint32(4, true), declaredLength = view.getUint32(8, true);
  if (version !== 2) throw new Error(`Only GLB version 2 is supported; received ${version}.`);
  if (declaredLength !== bytes.byteLength) throw new Error(`GLB declares ${declaredLength} bytes but contains ${bytes.byteLength}.`);
  let offset = 12, document: unknown, binary: Uint8Array | undefined;
  while (offset < bytes.byteLength) {
    if (offset + 8 > bytes.byteLength) throw new Error("GLB chunk header exceeds the container length.");
    const length = view.getUint32(offset, true), type = view.getUint32(offset + 4, true), start = offset + 8, end = start + length;
    if (end > bytes.byteLength) throw new Error("GLB chunk exceeds the container length.");
    if (type === GLB_JSON_CHUNK) { if (document !== undefined) throw new Error("GLB contains more than one JSON chunk."); document = parseGltfJson(bytes.subarray(start, end)); }
    else if (type === GLB_BINARY_CHUNK) { if (binary) throw new Error("GLB contains more than one binary chunk."); binary = bytes.slice(start, end); }
    offset = end;
  }
  if (document === undefined) throw new Error("GLB is missing its JSON chunk.");
  const buffers = typeof document === "object" && document !== null && "buffers" in document ? document.buffers : undefined;
  if (buffers !== undefined && !Array.isArray(buffers)) throw new Error("GLB buffers must be an array.");
  const uriLess = buffers?.map((buffer, index) => buffer.uri === undefined ? index : -1).filter((index) => index >= 0) ?? [];
  if (uriLess.length > 1) throw new Error("GLB may declare at most one URI-less binary buffer.");
  if (uriLess.length === 1 && !binary) throw new Error("GLB declares a URI-less buffer but has no binary chunk.");
  return { document, embeddedBuffers: binary && uriLess.length ? new Map([[uriLess[0]!, binary]]) : new Map(), kind: "glb" };
}

function parseGltfJson(bytes: Uint8Array): unknown {
  let end = bytes.byteLength; while (end > 0 && (bytes[end - 1] === 0 || bytes[end - 1] === 0x20)) end -= 1;
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, end))); }
  catch (cause) { throw new Error(`Asset is not valid UTF-8 glTF JSON: ${errorMessage(cause, { stringify: true })}`); }
}

export type ResolveAndCookGltfStaticOptions = GltfBufferResolverOptions & { cook?: GltfStaticCookOptions };

type ResolvedLimits = { [Key in keyof typeof DEFAULT_LIMITS]: number };
type JsonRecord = Record<string, unknown>;

function createGltfFailure(code: string, pointer: string, message: string) {
  const error = new Error(message);
  error.name = "GltfFailure";
  return Object.assign(error, { code, pointer });
}

type GltfFailure = ReturnType<typeof createGltfFailure>;

function isGltfFailure(cause: unknown): cause is GltfFailure {
  return cause instanceof Error
    && cause.name === "GltfFailure"
    && typeof Reflect.get(cause, "code") === "string"
    && typeof Reflect.get(cause, "pointer") === "string";
}

/**
 * Resolves glTF buffer declarations without owning network or filesystem policy.
 * Base64 data URIs are decoded locally; URI-less GLB chunks and external URIs
 * cross explicit caller-supplied adapter boundaries.
 */
export async function resolveGltfStaticBuffers(document: unknown, options: GltfBufferResolverOptions = {}): Promise<GltfBufferResolutionResult> {
  const diagnostics: GltfStaticDiagnostic[] = [];
  const maxBuffers = boundedOption(options.maxBuffers, DEFAULT_LIMITS.maxBuffers, HARD_LIMITS.maxBuffers, "maxBuffers");
  const maxBufferBytes = boundedOption(options.maxBufferBytes, DEFAULT_LIMITS.maxBufferBytes, HARD_LIMITS.maxBufferBytes, "maxBufferBytes");
  try {
    const root = record(document, "", "document-type", "glTF document must be a JSON object.");
    const declarations = array(root.buffers, "/buffers", "buffers-required", "glTF buffers must be an array.");
    if (declarations.length > maxBuffers) fail("buffer-count-limit", "/buffers", `Buffer count ${declarations.length} exceeds limit ${maxBuffers}.`);
    const buffers: Uint8Array[] = [];
    let totalBytes = 0;
    for (let index = 0; index < declarations.length; index += 1) {
      const pointer = `/buffers/${index}`;
      try {
        const declaration = record(declarations[index], pointer, "buffer-type", "Buffer declaration must be an object.");
        const byteLength = uint(declaration.byteLength, `${pointer}/byteLength`, "buffer-byte-length", 1, maxBufferBytes);
        let bytes: Uint8Array;
        if (declaration.uri === undefined) {
          const embedded = embeddedAt(options.embeddedBuffers, index);
          if (!embedded) fail("embedded-buffer-missing", pointer, `Buffer ${index} has no URI and requires caller-supplied embedded bytes.`);
          bytes = copyBufferSource(embedded, pointer);
        } else {
          const uri = text(declaration.uri, `${pointer}/uri`, "buffer-uri", 4_096);
          if (uri.startsWith("data:")) {
            bytes = decodeBufferDataUri(uri, `${pointer}/uri`, maxBufferBytes);
          } else {
            if (!options.resolveExternal) fail("external-buffer-resolver-missing", `${pointer}/uri`, `External buffer URI ${JSON.stringify(uri)} requires a resolver.`);
            let resolved: ArrayBuffer | ArrayBufferView;
            try {
              resolved = await options.resolveExternal({ index, uri, declaredByteLength: byteLength, pointer: `${pointer}/uri` });
            } catch (cause) {
              fail("external-buffer-resolution-failed", `${pointer}/uri`, `External buffer resolution failed: ${errorMessage(cause, { stringify: true })}`);
            }
            bytes = copyBufferSource(resolved, `${pointer}/uri`);
          }
        }
        if (bytes.byteLength < byteLength) fail("buffer-too-short", pointer, `Resolved buffer has ${bytes.byteLength} bytes but declares ${byteLength}.`);
        if (bytes.byteLength > maxBufferBytes) fail("buffer-byte-limit", pointer, `Resolved buffer has ${bytes.byteLength} bytes and exceeds limit ${maxBufferBytes}.`);
        totalBytes = checkedAdd(totalBytes, bytes.byteLength, maxBufferBytes, "/buffers", "buffer-byte-limit", "Combined resolved buffers");
        buffers.push(bytes);
      } catch (cause) {
        diagnostics.push(toDiagnostic(cause, pointer));
      }
    }
    if (diagnostics.some(({ severity }) => severity === "error")) return { ok: false, buffers: [], diagnostics, totalBytes: 0 };
    return { ok: true, buffers, diagnostics, totalBytes };
  } catch (cause) {
    diagnostics.push(toDiagnostic(cause, ""));
    return { ok: false, buffers: [], diagnostics, totalBytes: 0 };
  }
}

/** Converts supported glTF mesh primitives into deterministic tightly packed arrays. */
export function cookGltfStaticMeshes(
  document: unknown,
  buffers: readonly (ArrayBuffer | ArrayBufferView)[],
  options: GltfStaticCookOptions = {},
): GltfStaticCookResult {
  const limits = resolveLimits(options);
  const diagnostics: GltfStaticDiagnostic[] = [];
  const cooked: CookedGltfStaticMesh[] = [];
  let outputBytes = 0;
  try {
    const root = record(document, "", "document-type", "glTF document must be a JSON object.");
    validateAsset(root);
    validateRequiredExtensions(root);
    const bufferDeclarations = array(root.buffers, "/buffers", "buffers-required", "glTF buffers must be an array.");
    const bufferViews = array(root.bufferViews, "/bufferViews", "buffer-views-required", "Static meshes require a bufferViews array.");
    const accessors = array(root.accessors, "/accessors", "accessors-required", "Static meshes require an accessors array.");
    const meshes = array(root.meshes, "/meshes", "meshes-required", "Static mesh cooking requires a meshes array.");
    enforceCount(bufferDeclarations.length, limits.maxBuffers, "/buffers", "buffer-count-limit", "buffers");
    enforceCount(bufferViews.length, limits.maxBufferViews, "/bufferViews", "buffer-view-count-limit", "bufferViews");
    enforceCount(accessors.length, limits.maxAccessors, "/accessors", "accessor-count-limit", "accessors");
    enforceCount(meshes.length, limits.maxMeshes, "/meshes", "mesh-count-limit", "meshes");
    if (!Array.isArray(buffers)) fail("buffers-input", "/buffers", "Resolved buffers must be supplied as an array.");
    if (buffers.length !== bufferDeclarations.length) fail("buffer-count-mismatch", "/buffers", `Expected ${bufferDeclarations.length} resolved buffers but received ${buffers.length}.`);
    const bytes = validateResolvedBuffers(bufferDeclarations, buffers, limits);
    const context = { root, bufferDeclarations, bufferViews, accessors, buffers: bytes, limits, allowSkinAttributes: options.allowSkinAttributes === true };
    let primitiveCount = 0;
    for (let meshIndex = 0; meshIndex < meshes.length; meshIndex += 1) {
      const meshPointer = `/meshes/${meshIndex}`;
      let mesh: JsonRecord;
      let primitives: unknown[];
      try {
        mesh = record(meshes[meshIndex], meshPointer, "mesh-type", "Mesh must be an object.");
        primitives = array(mesh.primitives, `${meshPointer}/primitives`, "primitives-required", "Mesh primitives must be an array.");
        if (primitives.length === 0) fail("primitives-empty", `${meshPointer}/primitives`, "Mesh must contain at least one primitive.");
        primitiveCount = checkedAdd(primitiveCount, primitives.length, limits.maxPrimitives, "/meshes", "primitive-count-limit", "Mesh primitives");
      } catch (cause) {
        diagnostics.push(toDiagnostic(cause, meshPointer));
        continue;
      }
      for (let primitiveIndex = 0; primitiveIndex < primitives.length; primitiveIndex += 1) {
        const pointer = `${meshPointer}/primitives/${primitiveIndex}`;
        try {
          const estimatedBytes = estimatePrimitiveOutputBytes(context, primitives[primitiveIndex], pointer);
          checkedAdd(outputBytes, estimatedBytes, limits.maxOutputBytes, pointer, "output-byte-limit", "Cooked output");
          const primitive = cookPrimitive(context, mesh, meshIndex, primitives[primitiveIndex], primitiveIndex, diagnostics);
          const bytesRequired = primitive.positions.byteLength + (primitive.normals?.byteLength ?? 0) + (primitive.uvs?.byteLength ?? 0) + primitive.indices.byteLength
            + (primitive.morphPositions?.reduce((total, target) => total + target.byteLength, 0) ?? 0) + (primitive.morphWeights?.byteLength ?? 0);
          outputBytes = checkedAdd(outputBytes, bytesRequired, limits.maxOutputBytes, pointer, "output-byte-limit", "Cooked output");
          cooked.push(primitive);
        } catch (cause) {
          diagnostics.push(toDiagnostic(cause, pointer));
        }
      }
    }
  } catch (cause) {
    diagnostics.push(toDiagnostic(cause, ""));
  }
  const ok = !diagnostics.some(({ severity }) => severity === "error");
  return { ok, meshes: ok ? cooked : [], diagnostics, outputBytes: ok ? outputBytes : 0 };
}

export async function resolveAndCookGltfStaticMeshes(document: unknown, options: ResolveAndCookGltfStaticOptions = {}): Promise<GltfStaticCookResult> {
  const resolution = await resolveGltfStaticBuffers(document, options);
  if (!resolution.ok) return { ok: false, meshes: [], diagnostics: resolution.diagnostics, outputBytes: 0 };
  const cooked = cookGltfStaticMeshes(document, resolution.buffers, options.cook);
  return { ...cooked, diagnostics: [...resolution.diagnostics, ...cooked.diagnostics] };
}

type CookContext = {
  root: JsonRecord;
  bufferDeclarations: unknown[];
  bufferViews: unknown[];
  accessors: unknown[];
  buffers: Uint8Array[];
  limits: ResolvedLimits;
  allowSkinAttributes: boolean;
};

function estimatePrimitiveOutputBytes(context: CookContext, input: unknown, pointer: string): number {
  const primitive = record(input, pointer, "primitive-type", "Mesh primitive must be an object.");
  const attributes = record(primitive.attributes, `${pointer}/attributes`, "attributes-required", "Primitive attributes must be an object.");
  if (attributes.POSITION === undefined) fail("position-required", `${pointer}/attributes/POSITION`, "Primitive POSITION accessor is required.");
  const positionAccessorIndex = arrayIndex(attributes.POSITION, context.accessors.length, `${pointer}/attributes/POSITION`, "accessor-index");
  const positionAccessor = accessorRecord(context, positionAccessorIndex, `${pointer}/attributes/POSITION`);
  const positionCount = uint(positionAccessor.count, `/accessors/${positionAccessorIndex}/count`, "accessor-count", 1, context.limits.maxVertices);
  let bytes = positionCount * 3 * Float32Array.BYTES_PER_ELEMENT;
  if (attributes.NORMAL !== undefined) {
    const index = arrayIndex(attributes.NORMAL, context.accessors.length, `${pointer}/attributes/NORMAL`, "accessor-index");
    const accessor = accessorRecord(context, index, `${pointer}/attributes/NORMAL`);
    bytes = checkedAdd(bytes, uint(accessor.count, `/accessors/${index}/count`, "accessor-count", 1, context.limits.maxVertices) * 3 * Float32Array.BYTES_PER_ELEMENT, context.limits.maxOutputBytes, pointer, "output-byte-limit", "Cooked primitive");
  }
  if (attributes.TEXCOORD_0 !== undefined) {
    const index = arrayIndex(attributes.TEXCOORD_0, context.accessors.length, `${pointer}/attributes/TEXCOORD_0`, "accessor-index");
    const accessor = accessorRecord(context, index, `${pointer}/attributes/TEXCOORD_0`);
    bytes = checkedAdd(bytes, uint(accessor.count, `/accessors/${index}/count`, "accessor-count", 1, context.limits.maxVertices) * 2 * Float32Array.BYTES_PER_ELEMENT, context.limits.maxOutputBytes, pointer, "output-byte-limit", "Cooked primitive");
  }
  if (primitive.targets !== undefined) {
    const targets = array(primitive.targets, `${pointer}/targets`, "morph-targets-type", "Morph targets must be an array.");
    if (targets.length < 1 || targets.length > 4) fail("morph-target-count", `${pointer}/targets`, "One through four morph targets are supported.");
    bytes = checkedAdd(bytes, targets.length * positionCount * 3 * Float32Array.BYTES_PER_ELEMENT + targets.length * Float32Array.BYTES_PER_ELEMENT, context.limits.maxOutputBytes, pointer, "output-byte-limit", "Cooked primitive");
  }
  const indexCount = primitive.indices === undefined
    ? positionCount
    : (() => {
      const index = arrayIndex(primitive.indices, context.accessors.length, `${pointer}/indices`, "accessor-index");
      return uint(accessorRecord(context, index, `${pointer}/indices`).count, `/accessors/${index}/count`, "accessor-count", 1, context.limits.maxIndices);
    })();
  const indexBytes = primitive.indices === undefined && positionCount <= 65_536 ? 2 : 4;
  return checkedAdd(bytes, indexCount * indexBytes, context.limits.maxOutputBytes, pointer, "output-byte-limit", "Cooked primitive");
}

function cookPrimitive(
  context: CookContext,
  mesh: JsonRecord,
  meshIndex: number,
  input: unknown,
  primitiveIndex: number,
  diagnostics: GltfStaticDiagnostic[],
): CookedGltfStaticMesh {
  const pointer = `/meshes/${meshIndex}/primitives/${primitiveIndex}`;
  const primitive = record(input, pointer, "primitive-type", "Mesh primitive must be an object.");
  if (primitive.mode !== undefined && primitive.mode !== GLTF_TRIANGLES) fail("primitive-mode-unsupported", `${pointer}/mode`, `Only glTF TRIANGLES mode (${GLTF_TRIANGLES}) is supported.`);
  if (primitive.extensions !== undefined && Object.keys(record(primitive.extensions, `${pointer}/extensions`, "primitive-extensions", "Primitive extensions must be an object.")).length > 0) {
    fail("primitive-extension-unsupported", `${pointer}/extensions`, "Geometry-affecting primitive extensions are not supported.");
  }
  const attributes = record(primitive.attributes, `${pointer}/attributes`, "attributes-required", "Primitive attributes must be an object.");
  for (const semantic of Object.keys(attributes).sort(compareText)) {
    if (semantic === "POSITION" || semantic === "NORMAL" || semantic === "TEXCOORD_0") continue;
    const attributePointer = `${pointer}/attributes/${escapePointer(semantic)}`;
    if (/^(JOINTS|WEIGHTS)_/.test(semantic)) {
      if (!context.allowSkinAttributes) fail("skinning-unsupported", attributePointer, `Skinned attribute ${semantic} is not supported by the static-mesh cooker.`);
      continue;
    }
    diagnostics.push({ severity: "warning", code: "attribute-ignored", pointer: attributePointer, message: `Attribute ${semantic} is not emitted by the static-mesh cooker.` });
  }
  if (!("POSITION" in attributes)) fail("position-required", `${pointer}/attributes/POSITION`, "Primitive POSITION accessor is required.");
  const positionIndex = arrayIndex(attributes.POSITION, context.accessors.length, `${pointer}/attributes/POSITION`, "accessor-index");
  const positions = readAttribute(context, positionIndex, "POSITION", `${pointer}/attributes/POSITION`);
  const vertexCount = positions.length / 3;
  enforceCount(vertexCount, context.limits.maxVertices, `${pointer}/attributes/POSITION`, "vertex-count-limit", "vertices");
  if (vertexCount === 0) fail("vertices-empty", `${pointer}/attributes/POSITION`, "Primitive must contain at least one vertex.");
  let normals: Float32Array | undefined;
  if (attributes.NORMAL !== undefined) {
    const accessor = arrayIndex(attributes.NORMAL, context.accessors.length, `${pointer}/attributes/NORMAL`, "accessor-index");
    normals = readAttribute(context, accessor, "NORMAL", `${pointer}/attributes/NORMAL`);
    if (normals.length / 3 !== vertexCount) fail("attribute-count-mismatch", `${pointer}/attributes/NORMAL`, "NORMAL count must equal POSITION count.");
  }
  let uvs: Float32Array | undefined;
  if (attributes.TEXCOORD_0 !== undefined) {
    const accessor = arrayIndex(attributes.TEXCOORD_0, context.accessors.length, `${pointer}/attributes/TEXCOORD_0`, "accessor-index");
    uvs = readAttribute(context, accessor, "TEXCOORD_0", `${pointer}/attributes/TEXCOORD_0`);
    if (uvs.length / 2 !== vertexCount) fail("attribute-count-mismatch", `${pointer}/attributes/TEXCOORD_0`, "TEXCOORD_0 count must equal POSITION count.");
  }
  let morphPositions: Float32Array[] | undefined, morphWeights: Float32Array | undefined;
  if (primitive.targets !== undefined) {
    const targets = array(primitive.targets, `${pointer}/targets`, "morph-targets-type", "Morph targets must be an array.");
    if (targets.length < 1 || targets.length > 4) fail("morph-target-count", `${pointer}/targets`, "One through four morph targets are supported.");
    morphPositions = targets.map((input, targetIndex) => {
      const targetPointer = `${pointer}/targets/${targetIndex}`, target = record(input, targetPointer, "morph-target-type", "Morph target must be an object.");
      for (const semantic of Object.keys(target)) if (semantic !== "POSITION") fail("morph-semantic-unsupported", `${targetPointer}/${escapePointer(semantic)}`, "Only morph POSITION deltas are supported.");
      if (target.POSITION === undefined) fail("morph-position-required", `${targetPointer}/POSITION`, "Morph target POSITION accessor is required.");
      const values = readAttribute(context, arrayIndex(target.POSITION, context.accessors.length, `${targetPointer}/POSITION`, "accessor-index"), "POSITION", `${targetPointer}/POSITION`);
      if (values.length !== positions.length) fail("morph-count-mismatch", `${targetPointer}/POSITION`, "Morph POSITION count must equal base POSITION count.");
      return values;
    });
    const defaults = mesh.weights === undefined ? [] : array(mesh.weights, `/meshes/${meshIndex}/weights`, "morph-weights-type", "Mesh morph weights must be an array.");
    if (defaults.length > morphPositions.length) fail("morph-weight-count", `/meshes/${meshIndex}/weights`, "Mesh morph weight count cannot exceed target count.");
    morphWeights = new Float32Array(morphPositions.length);
    for (let index = 0; index < defaults.length; index += 1) morphWeights[index] = finiteNumber(defaults[index], `/meshes/${meshIndex}/weights/${index}`, "morph-weight");
  }
  const indices = primitive.indices === undefined
    ? sequentialIndices(vertexCount, `${pointer}/attributes/POSITION`)
    : readIndices(context, arrayIndex(primitive.indices, context.accessors.length, `${pointer}/indices`, "accessor-index"), vertexCount, `${pointer}/indices`);
  enforceCount(indices.length, context.limits.maxIndices, primitive.indices === undefined ? `${pointer}/attributes/POSITION` : `${pointer}/indices`, "index-count-limit", "indices");
  if (indices.length % 3 !== 0) fail("triangle-index-count", primitive.indices === undefined ? `${pointer}/attributes/POSITION` : `${pointer}/indices`, "TRIANGLES index count must be divisible by 3.");
  let material: number | undefined;
  if (primitive.material !== undefined) {
    const materials = context.root.materials === undefined ? [] : array(context.root.materials, "/materials", "materials-type", "materials must be an array.");
    material = arrayIndex(primitive.material, materials.length, `${pointer}/material`, "material-index");
  }
  const meshName = mesh.name === undefined ? `mesh-${meshIndex}` : text(mesh.name, `/meshes/${meshIndex}/name`, "mesh-name", 256);
  return {
    meshIndex,
    primitiveIndex,
    label: `${meshName}/primitive-${primitiveIndex}`,
    ...(material === undefined ? {} : { material }),
    positions,
    ...(normals ? { normals } : {}),
    ...(uvs ? { uvs } : {}),
    ...(morphPositions ? { morphPositions, morphWeights } : {}),
    indices,
    topology: "triangle-list",
    bounds: computeBounds(positions),
  };
}

function readAttribute(context: CookContext, accessorIndex: number, semantic: "POSITION" | "NORMAL" | "TEXCOORD_0", sourcePointer: string): Float32Array {
  const accessorPointer = `/accessors/${accessorIndex}`;
  const accessor = accessorRecord(context, accessorIndex, sourcePointer);
  const expectedType = semantic === "TEXCOORD_0" ? "VEC2" : "VEC3";
  if (accessor.type !== expectedType) fail("accessor-type", `${accessorPointer}/type`, `${semantic} accessor type must be ${expectedType}.`);
  const componentType = uint(accessor.componentType, `${accessorPointer}/componentType`, "accessor-component-type", 1, 65_535);
  const normalized = accessor.normalized === true;
  if (accessor.normalized !== undefined && typeof accessor.normalized !== "boolean") fail("accessor-normalized", `${accessorPointer}/normalized`, "Accessor normalized must be boolean.");
  if (semantic === "POSITION" && (componentType !== GLTF_FLOAT || normalized)) fail("position-component-type", `${accessorPointer}/componentType`, "POSITION requires non-normalized FLOAT components.");
  if (semantic === "NORMAL" && !(
    componentType === GLTF_FLOAT && !normalized
    || (componentType === GLTF_BYTE || componentType === GLTF_SHORT) && normalized
  )) fail("normal-component-type", `${accessorPointer}/componentType`, "NORMAL requires FLOAT or normalized BYTE/SHORT components.");
  if (semantic === "TEXCOORD_0" && !(
    componentType === GLTF_FLOAT && !normalized
    || (componentType === GLTF_UNSIGNED_BYTE || componentType === GLTF_UNSIGNED_SHORT) && normalized
  )) fail("uv-component-type", `${accessorPointer}/componentType`, "TEXCOORD_0 requires FLOAT or normalized UNSIGNED_BYTE/UNSIGNED_SHORT components.");
  const components = semantic === "TEXCOORD_0" ? 2 : 3;
  const view = accessorView(context, accessor, accessorPointer, componentType, components, false);
  const output = new Float32Array(view.count * components);
  let write = 0;
  for (let element = 0; element < view.count; element += 1) {
    const offset = view.start + element * view.stride;
    for (let component = 0; component < components; component += 1) {
      const value = readComponent(view.data, offset + component * view.componentBytes, componentType, normalized);
      if (!Number.isFinite(value)) fail("accessor-non-finite", accessorPointer, `${semantic} accessor contains a non-finite value at element ${element}, component ${component}.`);
      output[write++] = value;
    }
  }
  return output;
}

function readIndices(context: CookContext, accessorIndex: number, vertexCount: number, sourcePointer: string): Uint16Array | Uint32Array {
  const accessorPointer = `/accessors/${accessorIndex}`;
  const accessor = accessorRecord(context, accessorIndex, sourcePointer);
  if (accessor.type !== "SCALAR") fail("index-accessor-type", `${accessorPointer}/type`, "Index accessor type must be SCALAR.");
  const componentType = uint(accessor.componentType, `${accessorPointer}/componentType`, "index-component-type", 1, 65_535);
  if (componentType !== GLTF_UNSIGNED_BYTE && componentType !== GLTF_UNSIGNED_SHORT && componentType !== GLTF_UNSIGNED_INT) {
    fail("index-component-type", `${accessorPointer}/componentType`, "Indices require UNSIGNED_BYTE, UNSIGNED_SHORT, or UNSIGNED_INT components.");
  }
  if (accessor.normalized !== undefined && accessor.normalized !== false) fail("index-normalized", `${accessorPointer}/normalized`, "Index accessors cannot be normalized.");
  const view = accessorView(context, accessor, accessorPointer, componentType, 1, true);
  let maximum = 0;
  const values = new Uint32Array(view.count);
  for (let index = 0; index < view.count; index += 1) {
    const value = readUnsigned(view.data, view.start + index * view.stride, componentType);
    if (value >= vertexCount) fail("index-out-of-range", accessorPointer, `Index ${value} at element ${index} exceeds vertex count ${vertexCount}.`);
    values[index] = value;
    maximum = Math.max(maximum, value);
  }
  return maximum <= 0xffff ? new Uint16Array(values) : values;
}

function accessorRecord(context: CookContext, accessorIndex: number, sourcePointer: string): JsonRecord {
  const pointer = `/accessors/${accessorIndex}`;
  const accessor = record(context.accessors[accessorIndex], pointer, "accessor-type", `Accessor referenced by ${sourcePointer} must be an object.`);
  if (accessor.sparse !== undefined) fail("sparse-accessor-unsupported", `${pointer}/sparse`, "Sparse accessors are not supported by the static-mesh cooker.");
  if (accessor.bufferView === undefined) fail("accessor-buffer-view-required", `${pointer}/bufferView`, "Non-sparse accessor requires a bufferView.");
  return accessor;
}

function accessorView(
  context: CookContext,
  accessor: JsonRecord,
  accessorPointer: string,
  componentType: number,
  components: number,
  indices: boolean,
) {
  const componentBytes = componentByteSize(componentType, `${accessorPointer}/componentType`);
  const elementBytes = componentBytes * components;
  const count = uint(accessor.count, `${accessorPointer}/count`, "accessor-count", 1, indices ? context.limits.maxIndices : context.limits.maxVertices);
  const bufferViewIndex = arrayIndex(accessor.bufferView, context.bufferViews.length, `${accessorPointer}/bufferView`, "buffer-view-index");
  const viewPointer = `/bufferViews/${bufferViewIndex}`;
  const view = record(context.bufferViews[bufferViewIndex], viewPointer, "buffer-view-type", "bufferView must be an object.");
  if (view.extensions !== undefined && Object.keys(record(view.extensions, `${viewPointer}/extensions`, "buffer-view-extensions", "bufferView extensions must be an object.")).length > 0) {
    fail("buffer-view-extension-unsupported", `${viewPointer}/extensions`, "Compressed or extension-defined bufferViews are not supported.");
  }
  const bufferIndex = arrayIndex(view.buffer, context.buffers.length, `${viewPointer}/buffer`, "buffer-index");
  const declaredBuffer = record(context.bufferDeclarations[bufferIndex], `/buffers/${bufferIndex}`, "buffer-type", "Buffer declaration must be an object.");
  const declaredBufferLength = uint(declaredBuffer.byteLength, `/buffers/${bufferIndex}/byteLength`, "buffer-byte-length", 1, context.limits.maxBufferBytes);
  const viewOffset = optionalUint(view.byteOffset, 0, `${viewPointer}/byteOffset`, "buffer-view-offset", 0, declaredBufferLength);
  const viewLength = uint(view.byteLength, `${viewPointer}/byteLength`, "buffer-view-length", 1, declaredBufferLength);
  if (viewOffset + viewLength > declaredBufferLength) fail("buffer-view-out-of-bounds", viewPointer, `bufferView range ${viewOffset}..${viewOffset + viewLength} exceeds declared buffer length ${declaredBufferLength}.`);
  const accessorOffset = optionalUint(accessor.byteOffset, 0, `${accessorPointer}/byteOffset`, "accessor-offset", 0, viewLength);
  if (accessorOffset % componentBytes !== 0 || (viewOffset + accessorOffset) % componentBytes !== 0) fail("accessor-alignment", `${accessorPointer}/byteOffset`, `Accessor offset must be aligned to ${componentBytes} bytes.`);
  let stride = elementBytes;
  if (view.byteStride !== undefined) {
    if (indices) fail("index-stride-unsupported", `${viewPointer}/byteStride`, "Index bufferViews cannot declare byteStride.");
    stride = uint(view.byteStride, `${viewPointer}/byteStride`, "buffer-view-stride", 4, 252);
    if (stride % 4 !== 0) fail("buffer-view-stride", `${viewPointer}/byteStride`, "Vertex byteStride must be a multiple of 4.");
    if (stride < elementBytes) fail("buffer-view-stride", `${viewPointer}/byteStride`, `Vertex byteStride ${stride} is smaller than element size ${elementBytes}.`);
  }
  const required = count === 0 ? 0 : (count - 1) * stride + elementBytes;
  if (!Number.isSafeInteger(required) || accessorOffset + required > viewLength) fail("accessor-out-of-bounds", accessorPointer, `Accessor needs ${required} bytes from offset ${accessorOffset}, exceeding bufferView length ${viewLength}.`);
  const start = viewOffset + accessorOffset;
  const data = new DataView(context.buffers[bufferIndex]!.buffer, context.buffers[bufferIndex]!.byteOffset, context.buffers[bufferIndex]!.byteLength);
  return { componentBytes, count, data, start, stride };
}

function validateAsset(root: JsonRecord): void {
  const asset = record(root.asset, "/asset", "asset-required", "glTF asset metadata is required.");
  if (asset.version !== "2.0") fail("asset-version", "/asset/version", "Only glTF asset version 2.0 is supported.");
  if (asset.minVersion !== undefined && asset.minVersion !== "2.0") fail("asset-min-version", "/asset/minVersion", `Unsupported glTF minimum version ${JSON.stringify(asset.minVersion)}.`);
}

function validateRequiredExtensions(root: JsonRecord): void {
  if (root.extensionsRequired === undefined) return;
  const required = array(root.extensionsRequired, "/extensionsRequired", "extensions-required-type", "extensionsRequired must be an array.");
  if (required.length > 0) {
    text(required[0], "/extensionsRequired/0", "extension-name", 256);
    fail("required-extension-unsupported", "/extensionsRequired/0", `Required extension ${JSON.stringify(required[0])} is not supported by the static-mesh cooker.`);
  }
}

function validateResolvedBuffers(declarations: unknown[], input: readonly (ArrayBuffer | ArrayBufferView)[], limits: ResolvedLimits): Uint8Array[] {
  const output: Uint8Array[] = [];
  let total = 0;
  for (let index = 0; index < declarations.length; index += 1) {
    const pointer = `/buffers/${index}`;
    const declaration = record(declarations[index], pointer, "buffer-type", "Buffer declaration must be an object.");
    const declared = uint(declaration.byteLength, `${pointer}/byteLength`, "buffer-byte-length", 1, limits.maxBufferBytes);
    const bytes = viewBufferSource(input[index]!, pointer);
    if (bytes.byteLength < declared) fail("buffer-too-short", pointer, `Resolved buffer has ${bytes.byteLength} bytes but declares ${declared}.`);
    if (bytes.byteLength > limits.maxBufferBytes) fail("buffer-byte-limit", pointer, `Resolved buffer exceeds ${limits.maxBufferBytes} bytes.`);
    total = checkedAdd(total, bytes.byteLength, limits.maxBufferBytes, "/buffers", "buffer-byte-limit", "Combined resolved buffers");
    output.push(bytes);
  }
  return output;
}

function computeBounds(positions: Float32Array): GltfStaticBounds {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < positions.length; index += 3) {
    const x = positions[index]!;
    const y = positions[index + 1]!;
    const z = positions[index + 2]!;
    minX = Math.min(minX, x); minY = Math.min(minY, y); minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); maxZ = Math.max(maxZ, z);
  }
  const x = (minX + maxX) * 0.5;
  const y = (minY + maxY) * 0.5;
  const z = (minZ + maxZ) * 0.5;
  let radiusSquared = 0;
  for (let index = 0; index < positions.length; index += 3) {
    const dx = positions[index]! - x;
    const dy = positions[index + 1]! - y;
    const dz = positions[index + 2]! - z;
    radiusSquared = Math.max(radiusSquared, dx * dx + dy * dy + dz * dz);
  }
  return { minX, minY, minZ, maxX, maxY, maxZ, x, y, z, radius: Math.sqrt(radiusSquared) };
}

function sequentialIndices(vertexCount: number, pointer: string): Uint16Array | Uint32Array {
  if (vertexCount > 0xffff_ffff) fail("index-address-limit", pointer, "Vertex count exceeds uint32 index range.");
  const output = vertexCount <= 65_536 ? new Uint16Array(vertexCount) : new Uint32Array(vertexCount);
  for (let index = 0; index < vertexCount; index += 1) output[index] = index;
  return output;
}

function readComponent(data: DataView, offset: number, componentType: number, normalized: boolean): number {
  if (componentType === GLTF_FLOAT) return data.getFloat32(offset, true);
  if (componentType === GLTF_BYTE) {
    const value = data.getInt8(offset);
    return normalized ? Math.max(value / 127, -1) : value;
  }
  if (componentType === GLTF_UNSIGNED_BYTE) {
    const value = data.getUint8(offset);
    return normalized ? value / 255 : value;
  }
  if (componentType === GLTF_SHORT) {
    const value = data.getInt16(offset, true);
    return normalized ? Math.max(value / 32_767, -1) : value;
  }
  if (componentType === GLTF_UNSIGNED_SHORT) {
    const value = data.getUint16(offset, true);
    return normalized ? value / 65_535 : value;
  }
  fail("accessor-component-type", "", `Unsupported component type ${componentType}.`);
}

function readUnsigned(data: DataView, offset: number, componentType: number): number {
  if (componentType === GLTF_UNSIGNED_BYTE) return data.getUint8(offset);
  if (componentType === GLTF_UNSIGNED_SHORT) return data.getUint16(offset, true);
  if (componentType === GLTF_UNSIGNED_INT) return data.getUint32(offset, true);
  fail("index-component-type", "", `Unsupported index component type ${componentType}.`);
}

function componentByteSize(componentType: number, pointer: string): number {
  if (componentType === GLTF_BYTE || componentType === GLTF_UNSIGNED_BYTE) return 1;
  if (componentType === GLTF_SHORT || componentType === GLTF_UNSIGNED_SHORT) return 2;
  if (componentType === GLTF_UNSIGNED_INT || componentType === GLTF_FLOAT) return 4;
  fail("accessor-component-type", pointer, `Unsupported accessor component type ${componentType}.`);
}

function decodeBufferDataUri(uri: string, pointer: string, maxBytes: number): Uint8Array {
  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/]*={0,2})$/.exec(uri);
  if (!match) fail("data-uri-unsupported", pointer, "Buffer data URI must use canonical base64 encoding.");
  if (match[1] !== "application/octet-stream" && match[1] !== "application/gltf-buffer") fail("data-uri-media-type", pointer, `Unsupported glTF buffer media type ${JSON.stringify(match[1])}.`);
  const payload = match[2]!;
  if (payload.length > Math.ceil(maxBytes / 3) * 4 + 4) fail("buffer-byte-limit", pointer, `Encoded buffer exceeds ${maxBytes} bytes.`);
  if (payload.length % 4 !== 0) fail("data-uri-base64", pointer, "Base64 buffer payload must include canonical padding.");
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const padding = payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0;
  const output = new Uint8Array(payload.length / 4 * 3 - padding);
  let write = 0;
  for (let offset = 0; offset < payload.length; offset += 4) {
    const values = [0, 1, 2, 3].map((part) => {
      const character = payload[offset + part]!;
      return character === "=" ? 0 : alphabet.indexOf(character);
    });
    if (values.some((value) => value < 0)) fail("data-uri-base64", pointer, "Buffer data URI contains invalid base64.");
    const combined = values[0]! << 18 | values[1]! << 12 | values[2]! << 6 | values[3]!;
    if (write < output.length) output[write++] = combined >>> 16;
    if (write < output.length) output[write++] = combined >>> 8 & 0xff;
    if (write < output.length) output[write++] = combined & 0xff;
  }
  const canonical = encodeBase64(output);
  if (canonical !== payload) fail("data-uri-base64", pointer, "Buffer data URI base64 is not canonical.");
  return output;
}

function encodeBase64(bytes: Uint8Array): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let output = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const a = bytes[index] ?? 0;
    const b = bytes[index + 1] ?? 0;
    const c = bytes[index + 2] ?? 0;
    output += alphabet[a >>> 2];
    output += alphabet[(a & 3) << 4 | b >>> 4];
    output += index + 1 < bytes.length ? alphabet[(b & 15) << 2 | c >>> 6] : "=";
    output += index + 2 < bytes.length ? alphabet[c & 63] : "=";
  }
  return output;
}

function embeddedAt(sources: GltfBufferResolverOptions["embeddedBuffers"], index: number): ArrayBuffer | ArrayBufferView | undefined {
  if (!sources) return undefined;
  if (isBufferSourceMap(sources)) return sources.get(index);
  return sources[index];
}

function isBufferSourceMap(
  sources: NonNullable<GltfBufferResolverOptions["embeddedBuffers"]>
): sources is ReadonlyMap<number, ArrayBuffer | ArrayBufferView> {
  const get: unknown = Reflect.get(sources, "get");
  return typeof get === "function";
}

function copyBufferSource(value: ArrayBuffer | ArrayBufferView, pointer: string): Uint8Array {
  if (value instanceof ArrayBuffer) return new Uint8Array(value.slice(0));
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength));
  fail("buffer-source-type", pointer, "Buffer source must be an ArrayBuffer or typed-array view.");
}

function viewBufferSource(value: ArrayBuffer | ArrayBufferView, pointer: string): Uint8Array {
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  fail("buffer-source-type", pointer, "Buffer source must be an ArrayBuffer or typed-array view.");
}

function resolveLimits(options: GltfStaticCookLimits): ResolvedLimits {
  return {
    maxBuffers: boundedOption(options.maxBuffers, DEFAULT_LIMITS.maxBuffers, HARD_LIMITS.maxBuffers, "maxBuffers"),
    maxBufferBytes: boundedOption(options.maxBufferBytes, DEFAULT_LIMITS.maxBufferBytes, HARD_LIMITS.maxBufferBytes, "maxBufferBytes"),
    maxBufferViews: boundedOption(options.maxBufferViews, DEFAULT_LIMITS.maxBufferViews, HARD_LIMITS.maxBufferViews, "maxBufferViews"),
    maxAccessors: boundedOption(options.maxAccessors, DEFAULT_LIMITS.maxAccessors, HARD_LIMITS.maxAccessors, "maxAccessors"),
    maxMeshes: boundedOption(options.maxMeshes, DEFAULT_LIMITS.maxMeshes, HARD_LIMITS.maxMeshes, "maxMeshes"),
    maxPrimitives: boundedOption(options.maxPrimitives, DEFAULT_LIMITS.maxPrimitives, HARD_LIMITS.maxPrimitives, "maxPrimitives"),
    maxVertices: boundedOption(options.maxVertices, DEFAULT_LIMITS.maxVertices, HARD_LIMITS.maxVertices, "maxVertices"),
    maxIndices: boundedOption(options.maxIndices, DEFAULT_LIMITS.maxIndices, HARD_LIMITS.maxIndices, "maxIndices"),
    maxOutputBytes: boundedOption(options.maxOutputBytes, DEFAULT_LIMITS.maxOutputBytes, HARD_LIMITS.maxOutputBytes, "maxOutputBytes"),
  };
}

function boundedOption(value: number | undefined, fallback: number, maximum: number, label: string): number {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved <= 0 || resolved > maximum) throw new RangeError(`${label} must be an integer from 1 through ${maximum}.`);
  return resolved;
}

function enforceCount(value: number, maximum: number, pointer: string, code: string, label: string): void {
  if (value > maximum) fail(code, pointer, `${label} count ${value} exceeds limit ${maximum}.`);
}

function checkedAdd(current: number, addition: number, maximum: number, pointer: string, code: string, label: string): number {
  const result = current + addition;
  if (!Number.isSafeInteger(result) || result > maximum) fail(code, pointer, `${label} exceed limit ${maximum}.`);
  return result;
}



function record(value: unknown, pointer: string, code: string, message: string): JsonRecord {
  if (!isJsonRecord(value)) fail(code, pointer, message);
  return value;
}

function array(value: unknown, pointer: string, code: string, message: string): unknown[] {
  if (!Array.isArray(value)) fail(code, pointer, message);
  return value;
}

function text(value: unknown, pointer: string, code: string, maxBytes: number): string {
  if (typeof value !== "string" || !value || value.length > maxBytes || new TextEncoder().encode(value).byteLength > maxBytes || /[\u0000-\u001f\u007f]/.test(value)) {
    fail(code, pointer, `Expected non-empty text no larger than ${maxBytes} bytes without control characters.`);
  }
  return value;
}

function uint(value: unknown, pointer: string, code: string, minimum: number, maximum: number): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum || value > maximum) fail(code, pointer, `Expected an integer from ${minimum} through ${maximum}.`);
  return value;
}

function finiteNumber(value: unknown, pointer: string, code: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) fail(code, pointer, "Value must be a finite number.");
  return value;
}

function optionalUint(value: unknown, fallback: number, pointer: string, code: string, minimum: number, maximum: number): number {
  return value === undefined ? fallback : uint(value, pointer, code, minimum, maximum);
}

function arrayIndex(value: unknown, length: number, pointer: string, code: string): number {
  if (length <= 0) fail(code, pointer, "Referenced array is empty.");
  return uint(value, pointer, code, 0, length - 1);
}

function fail(code: string, pointer: string, message: string): never {
  throw createGltfFailure(code, pointer, message);
}

function toDiagnostic(cause: unknown, fallbackPointer: string): GltfStaticDiagnostic {
  if (isGltfFailure(cause)) return { severity: "error", code: cause.code, pointer: cause.pointer, message: cause.message };
  return { severity: "error", code: "internal-validation-error", pointer: fallbackPointer, message: errorMessage(cause, { stringify: true }) };
}



function escapePointer(value: string): string {
  return value.replaceAll("~", "~0").replaceAll("/", "~1");
}
