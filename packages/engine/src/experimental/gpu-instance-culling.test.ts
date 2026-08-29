import { expect, test } from "bun:test";
import { createFrustumPlanes3D, createInstanceVisibilityBuffer3D } from "../render/3d-core.ts";
import { createCapabilityGatedInstanceCuller3D } from "./gpu-instance-culling.ts";

const allSpaceFrustum = () => {
  const planes = createFrustumPlanes3D();
  for (let index = 0; index < 6; index += 1) planes[index * 4 + 3] = 1;
  return planes;
};

test("capability-gated culler uses injected compute output above its threshold", async () => {
  const output = createInstanceVisibilityBuffer3D(2);
  const culler = createCapabilityGatedInstanceCuller3D({
    minimumGpuInstances: 1,
    backend: {
      supported: true,
      async cull(_planes, _bounds, target) {
        target.indices[0] = 1; target.count = 1; target.tested = 2; target.visible = 1; target.truncated = 0;
        return target;
      }
    }
  });
  const result = await culler.cull(allSpaceFrustum(), { centers: [0, 0, 0, 1, 0, 0], radii: [1, 1] }, output);
  expect(result.backend).toBe("gpu");
  expect(output.indices[0]).toBe(1);
});

test("capability-gated culler falls back to CPU after backend failure", async () => {
  const failures: unknown[] = [];
  const output = createInstanceVisibilityBuffer3D(1);
  const culler = createCapabilityGatedInstanceCuller3D({
    minimumGpuInstances: 0, onFallback(error) { failures.push(error); },
    backend: { supported: true, async cull() { throw new Error("device lost"); } }
  });
  const result = await culler.cull(allSpaceFrustum(), { centers: [0, 0, 0], radii: [1] }, output);
  expect(result.backend).toBe("cpu");
  expect(output.count).toBe(1);
  expect(failures).toHaveLength(1);
});
