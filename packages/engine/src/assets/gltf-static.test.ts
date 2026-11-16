import { describe, expect, test } from "bun:test";
import {
  cookGltfStaticMeshes,
  parseGltfContainer,
  resolveAndCookGltfStaticMeshes,
  resolveGltfStaticBuffers,
} from "./gltf-static.ts";

async function fixture() {
  return JSON.parse(await Bun.file(new URL("../../fixtures/gltf-static/triangle.gltf", import.meta.url)).text());
}

function externalInterleaved(index = 2): { bytes: Uint8Array; document: any } {
  const bytes = new Uint8Array(63);
  const view = new DataView(bytes.buffer);
  const vertices = [
    [0, 0, 0, 0, 0],
    [2, 0, 0, 65_535, 0],
    [0, 2, 0, 0, 65_535],
  ];
  vertices.forEach((vertex, vertexIndex) => {
    const offset = vertexIndex * 20;
    view.setFloat32(offset, vertex[0]!, true);
    view.setFloat32(offset + 4, vertex[1]!, true);
    view.setFloat32(offset + 8, vertex[2]!, true);
    view.setUint16(offset + 12, vertex[3]!, true);
    view.setUint16(offset + 14, vertex[4]!, true);
  });
  bytes.set([0, 1, index], 60);
  const document = {
    asset: { version: "2.0" },
    buffers: [{ uri: "mesh.bin", byteLength: 63 }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 60, byteStride: 20 },
      { buffer: 0, byteOffset: 60, byteLength: 3 },
    ],
    accessors: [
      { bufferView: 0, byteOffset: 0, componentType: 5126, count: 3, type: "VEC3" },
      { bufferView: 0, byteOffset: 12, componentType: 5123, normalized: true, count: 3, type: "VEC2" },
      { bufferView: 1, componentType: 5121, count: 3, type: "SCALAR" },
    ],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, TEXCOORD_0: 1 }, indices: 2 }] }],
  };
  return { bytes, document };
}

describe("vendor-neutral glTF static mesh cooking", () => {
  test("cooks the standalone glTF 2.0 data-URI fixture into packed scene geometry", async () => {
    const result = await resolveAndCookGltfStaticMeshes(await fixture());
    expect(result.ok).toBe(true);
    expect(result.diagnostics).toEqual([]);
    expect(result.meshes).toHaveLength(1);
    const mesh = result.meshes[0]!;
    expect(mesh.label).toBe("IndependentTriangle/primitive-0");
    expect([...mesh.positions]).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    expect([...mesh.normals!]).toEqual([0, 0, 1, 0, 0, 1, 0, 0, 1]);
    expect([...mesh.uvs!]).toEqual([0, 0, 1, 0, 0, 1]);
    expect(mesh.indices).toBeInstanceOf(Uint16Array);
    expect([...mesh.indices]).toEqual([0, 1, 2]);
    expect(mesh.bounds).toEqual({ minX: 0, minY: 0, minZ: 0, maxX: 1, maxY: 1, maxZ: 0, x: 0.5, y: 0.5, z: 0, radius: Math.SQRT1_2 });
    expect(result.outputBytes).toBe(102);
  });

  test("resolves ordinary external buffers only through the caller adapter", async () => {
    const { bytes, document } = externalInterleaved();
    const requests: string[] = [];
    const missing = await resolveGltfStaticBuffers(document);
    expect(missing).toEqual(expect.objectContaining({ ok: false, buffers: [] }));
    expect(missing.diagnostics[0]).toEqual(expect.objectContaining({ code: "external-buffer-resolver-missing", pointer: "/buffers/0/uri" }));

    const result = await resolveAndCookGltfStaticMeshes(document, {
      resolveExternal(request) {
        requests.push(`${request.index}:${request.uri}:${request.declaredByteLength}`);
        return bytes;
      },
    });
    expect(requests).toEqual(["0:mesh.bin:63"]);
    expect(result.ok).toBe(true);
    expect([...result.meshes[0]!.positions]).toEqual([0, 0, 0, 2, 0, 0, 0, 2, 0]);
    expect([...result.meshes[0]!.uvs!]).toEqual([0, 0, 1, 0, 0, 1]);
  });

  test("accepts URI-less GLB-style bytes at the embedded adapter boundary", async () => {
    const { bytes, document } = externalInterleaved();
    delete document.buffers[0].uri;
    const resolution = await resolveGltfStaticBuffers(document, { embeddedBuffers: new Map([[0, bytes]]) });
    expect(resolution.ok).toBe(true);
    expect(resolution.totalBytes).toBe(63);
    expect(cookGltfStaticMeshes(document, resolution.buffers).ok).toBe(true);
  });

  test("parses and cooks a complete GLB 2.0 container", async () => {
    const { bytes, document } = externalInterleaved(); delete document.buffers[0].uri;
    const container = parseGltfContainer(glb(document, bytes));
    expect(container.kind).toBe("glb"); expect(Array.from(container.embeddedBuffers.get(0)?.slice(0, bytes.length) ?? [])).toEqual(Array.from(bytes));
    const result = await resolveAndCookGltfStaticMeshes(container.document, { embeddedBuffers: container.embeddedBuffers });
    expect(result.ok).toBe(true); expect([...result.meshes[0]!.positions]).toEqual([0, 0, 0, 2, 0, 0, 0, 2, 0]);
  });

  test("is deterministic and does not retain caller buffer aliases", async () => {
    const { bytes, document } = externalInterleaved();
    const first = cookGltfStaticMeshes(document, [bytes]);
    const second = cookGltfStaticMeshes(document, [bytes]);
    expect(first).toEqual(second);
    bytes.fill(0);
    expect([...first.meshes[0]!.positions]).toEqual([0, 0, 0, 2, 0, 0, 0, 2, 0]);
  });

  test("generates deterministic indices when a triangle primitive is unindexed", () => {
    const { bytes, document } = externalInterleaved();
    delete document.meshes[0].primitives[0].indices;
    const result = cookGltfStaticMeshes(document, [bytes]);
    expect(result.ok).toBe(true);
    expect([...result.meshes[0]!.indices]).toEqual([0, 1, 2]);
  });

  test("cooks bounded position morph targets and mesh default weights", () => {
    const source = externalInterleaved();
    const bytes = new Uint8Array(100);
    bytes.set(source.bytes);
    new Float32Array(bytes.buffer, 64, 9).set([
      0, 0, 0,
      0.5, 0, 0,
      0, 0.25, 0,
    ]);
    source.document.buffers[0].byteLength = bytes.byteLength;
    source.document.bufferViews.push({ buffer: 0, byteOffset: 64, byteLength: 36 });
    source.document.accessors.push({ bufferView: 2, componentType: 5126, count: 3, type: "VEC3" });
    source.document.meshes[0].weights = [0.375];
    source.document.meshes[0].primitives[0].targets = [{ POSITION: 3 }];

    const result = cookGltfStaticMeshes(source.document, [bytes]);
    expect(result.ok).toBe(true);
    expect([...result.meshes[0]!.morphPositions![0]!]).toEqual([0, 0, 0, 0.5, 0, 0, 0, 0.25, 0]);
    expect([...result.meshes[0]!.morphWeights!]).toEqual([0.375]);
    expect(result.outputBytes).toBe(106);
  });

  test("reports precise accessor pointers for stride, range, sparse, and index failures", async () => {
    const stride = externalInterleaved();
    stride.document.bufferViews[0].byteStride = 8;
    expect(cookGltfStaticMeshes(stride.document, [stride.bytes]).diagnostics[0]).toEqual(expect.objectContaining({ code: "buffer-view-stride", pointer: "/bufferViews/0/byteStride" }));

    const rangeDocument = await fixture();
    const rangeBuffers = await resolveGltfStaticBuffers(rangeDocument);
    rangeDocument.bufferViews[0].byteLength = 35;
    expect(cookGltfStaticMeshes(rangeDocument, rangeBuffers.buffers).diagnostics[0]).toEqual(expect.objectContaining({ code: "accessor-out-of-bounds", pointer: "/accessors/0" }));

    const sparseDocument = await fixture();
    const sparseBuffers = await resolveGltfStaticBuffers(sparseDocument);
    sparseDocument.accessors[0].sparse = { count: 1 };
    expect(cookGltfStaticMeshes(sparseDocument, sparseBuffers.buffers).diagnostics[0]).toEqual(expect.objectContaining({ code: "sparse-accessor-unsupported", pointer: "/accessors/0/sparse" }));

    const invalidIndex = externalInterleaved(3);
    expect(cookGltfStaticMeshes(invalidIndex.document, [invalidIndex.bytes]).diagnostics[0]).toEqual(expect.objectContaining({ code: "index-out-of-range", pointer: "/accessors/2" }));
  });

  test("fails the whole cook instead of silently emitting partial static geometry", () => {
    const { bytes, document } = externalInterleaved();
    document.meshes.push({ primitives: [{ attributes: { POSITION: 0, JOINTS_0: 0 } }] });
    const result = cookGltfStaticMeshes(document, [bytes]);
    expect(result.ok).toBe(false);
    expect(result.meshes).toEqual([]);
    expect(result.outputBytes).toBe(0);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: "skinning-unsupported", pointer: "/meshes/1/primitives/0/attributes/JOINTS_0" }));
  });

  test("reports ignored optional attributes without hiding the warning", () => {
    const { bytes, document } = externalInterleaved();
    document.meshes[0].primitives[0].attributes.COLOR_0 = 0;
    const result = cookGltfStaticMeshes(document, [bytes]);
    expect(result.ok).toBe(true);
    expect(result.diagnostics).toEqual([expect.objectContaining({ severity: "warning", code: "attribute-ignored", pointer: "/meshes/0/primitives/0/attributes/COLOR_0" })]);
  });

  test("enforces caller limits and rejects non-finite vertex data", () => {
    const limited = externalInterleaved();
    const limitResult = cookGltfStaticMeshes(limited.document, [limited.bytes], { maxVertices: 2 });
    expect(limitResult).toEqual(expect.objectContaining({ ok: false, meshes: [] }));
    expect(limitResult.diagnostics[0]).toEqual(expect.objectContaining({ code: "accessor-count", pointer: "/accessors/0/count" }));

    const nonFinite = externalInterleaved();
    new DataView(nonFinite.bytes.buffer).setFloat32(0, Number.NaN, true);
    expect(cookGltfStaticMeshes(nonFinite.document, [nonFinite.bytes]).diagnostics[0]).toEqual(expect.objectContaining({ code: "accessor-non-finite", pointer: "/accessors/0" }));
    expect(() => cookGltfStaticMeshes(nonFinite.document, [nonFinite.bytes], { maxOutputBytes: 1073741825 })).toThrow("maxOutputBytes");
  });
});

function glb(document: unknown, binary: Uint8Array): Uint8Array {
  const json = new TextEncoder().encode(JSON.stringify(document)), jsonLength = Math.ceil(json.length / 4) * 4, binaryLength = Math.ceil(binary.length / 4) * 4;
  const output = new Uint8Array(20 + jsonLength + 8 + binaryLength); const view = new DataView(output.buffer);
  view.setUint32(0, 0x46546c67, true); view.setUint32(4, 2, true); view.setUint32(8, output.length, true); view.setUint32(12, jsonLength, true); view.setUint32(16, 0x4e4f534a, true);
  output.fill(0x20, 20, 20 + jsonLength); output.set(json, 20); const binaryHeader = 20 + jsonLength; view.setUint32(binaryHeader, binaryLength, true); view.setUint32(binaryHeader + 4, 0x004e4942, true); output.set(Array.from(binary), binaryHeader + 8); return output;
}
