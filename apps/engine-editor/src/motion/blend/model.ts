import { z } from "zod/v4";
import { minimumMovingArea, MESH_AREA_EPSILON } from "./geometry.ts";

const coordinate = z.number().min(0).max(1);
const point = z.tuple([coordinate, coordinate]);
export const imageBlendVertexSchema = z.object({ from: point, to: point }).strict();
export const imageBlendMeshSchema = z.object({
  vertices: z.array(imageBlendVertexSchema).min(4).max(128),
  triangles: z.array(z.tuple([z.number().int().min(0).max(127), z.number().int().min(0).max(127), z.number().int().min(0).max(127)])).min(2).max(254),
}).strict().superRefine((mesh, context) => {
  const issue = (message: string) => context.addIssue({ code: "custom", message });
  const corners = [[0, 0], [1, 0], [1, 1], [0, 1]];
  for (let i = 0; i < mesh.vertices.length; i++) {
    const v = mesh.vertices[i]!;
    for (const side of ["from", "to"] as const) {
      const p = v[side];
      if (i < 4) {
        if (p[0] !== corners[i]![0] || p[1] !== corners[i]![1]) issue("The first four paired vertices must remain the unit rectangle corners (0,0), (1,0), (1,1), (0,1)");
      } else if (p.some(n => n <= 0 || n >= 1)) issue("Authored landmarks must be strictly inside the four boundary corners");
    }
  }
  const edges = new Map<string, number[]>(), used = new Set<number>();
  for (const tri of mesh.triangles) {
    if (new Set(tri).size !== 3 || tri.some(i => i >= mesh.vertices.length)) {
      issue("Triangles must reference three distinct existing vertices");
      continue;
    }
    const vertices = tri.map(i => mesh.vertices[i]!);
    if (minimumMovingArea(vertices.map(v => v.from), vertices.map(v => v.to)) <= MESH_AREA_EPSILON)
      issue("Mesh triangle collapses or reverses during the blend; reposition landmarks or change the triangles");
    for (let i = 0; i < 3; i++) {
      const a = tri[i]!, b = tri[(i + 1) % 3]!;
      used.add(a);
      const key = `${Math.min(a, b)}:${Math.max(a, b)}`;
      const directions = edges.get(key) ?? [];
      directions.push(a < b ? 1 : -1);
      edges.set(key, directions);
    }
  }
  // A positive oriented triangulated disk with this fixed convex boundary is
  // bijective. Together with the area polynomial this excludes foldovers at any t.
  const boundary = new Map([["0:1", 1], ["1:2", 1], ["2:3", 1], ["0:3", -1]]);
  for (const [edge, directions] of edges) {
    const direction = boundary.get(edge);
    if (direction !== undefined) {
      if (directions.length !== 1 || directions[0] !== direction) issue("Mesh boundary must cover the rectangle exactly once");
      boundary.delete(edge);
    } else if (directions.length !== 2 || directions[0]! + directions[1]! !== 0) issue("Mesh triangles must share interior edges exactly twice in opposite directions");
  }
  if (boundary.size || used.size !== mesh.vertices.length || mesh.triangles.length !== mesh.vertices.length * 2 - 6)
    issue("Mesh must cover the whole rectangle with every landmark connected and no holes");
});
export type ImageBlendMesh = z.infer<typeof imageBlendMeshSchema>;
export type ImageBlendVertex = z.infer<typeof imageBlendVertexSchema>;
export const imageBlendEndpointSchema = z.object({ sourceId: z.string().trim().min(1).max(128), frameIndex: z.number().int().min(0).max(7199) }).strict();
export type ImageBlendEndpoint = z.infer<typeof imageBlendEndpointSchema>;
export const imageBlendSchema = z.object({
  from: imageBlendEndpointSchema,
  to: imageBlendEndpointSchema,
  mode: z.enum(["dissolve", "mesh"]),
  keys: z.array(z.object({
    frame: z.number().min(0).max(1_000_000),
    amount: coordinate,
    easing: z.enum(["linear", "hold", "ease-in", "ease-out", "ease-in-out"]),
  }).strict()).min(1).max(256),
  mesh: imageBlendMeshSchema.optional(),
}).strict().superRefine((blend, context) => {
  if (blend.mode === "mesh" && !blend.mesh) context.addIssue({ code: "custom", path: ["mesh"], message: "Mesh mode requires authored paired landmarks and triangles" });
  if (blend.mode === "dissolve" && blend.mesh) context.addIssue({ code: "custom", path: ["mesh"], message: "Remove the mesh when selecting dissolve mode" });
  blend.keys.forEach((key, index) => {
    if ((index === 0 && key.frame !== 0) || (index > 0 && key.frame <= blend.keys[index - 1]!.frame))
      context.addIssue({ code: "custom", path: ["keys", index, "frame"], message: "Blend progress keys must start at 0 and increase strictly (fractional frames are supported)" });
  });
});
export type ImageBlend = z.infer<typeof imageBlendSchema>;

/** Outgoing easing, arbitrary subframes, reversible progress, no seek history. */
export function sampleImageBlendAmount(blend: ImageBlend, clipOffset: number) {
  if (!Number.isFinite(clipOffset)) throw new Error("Blend sample frame must be finite");
  let left = blend.keys[0]!;
  for (let i = 1; i < blend.keys.length; i++) {
    const right = blend.keys[i]!;
    if (clipOffset < right.frame) {
      let t = Math.max(0, (clipOffset - left.frame) / (right.frame - left.frame));
      if (left.easing === "hold") t = 0;
      else if (left.easing === "ease-in") t *= t;
      else if (left.easing === "ease-out") t = 1 - (1 - t) ** 2;
      else if (left.easing === "ease-in-out") t = t * t * (3 - 2 * t);
      return left.amount + (right.amount - left.amount) * t;
    }
    left = right;
  }
  return left.amount;
}
