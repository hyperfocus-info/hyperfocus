import {
  collectVisibleInstanceSpheres3D,
  type InstanceSphereBounds3D,
  type InstanceVisibilityBuffer3D
} from "../render/3d-core.ts";

export interface GpuInstanceCullingBackend3D {
  readonly supported: boolean;
  cull(
    frustumPlanes: ArrayLike<number>,
    bounds: InstanceSphereBounds3D,
    output: InstanceVisibilityBuffer3D
  ): Promise<InstanceVisibilityBuffer3D>;
}

export interface CapabilityGatedCullingOptions3D {
  backend?: GpuInstanceCullingBackend3D;
  minimumGpuInstances?: number;
  onFallback?: (error: unknown) => void;
}

export interface CapabilityGatedCullingResult3D {
  readonly backend: "gpu" | "cpu";
  readonly visibility: InstanceVisibilityBuffer3D;
}

/** Uses an injected compute backend when worthwhile, with authoritative CPU fallback. */
export class CapabilityGatedInstanceCuller3D {
  readonly #backend: GpuInstanceCullingBackend3D | undefined;
  readonly #minimumGpuInstances: number;
  readonly #onFallback: ((error: unknown) => void) | undefined;

  constructor(options: CapabilityGatedCullingOptions3D = {}) {
    this.#backend = options.backend;
    this.#minimumGpuInstances = options.minimumGpuInstances ?? 1_024;
    if (!Number.isSafeInteger(this.#minimumGpuInstances) || this.#minimumGpuInstances < 0) {
      throw new RangeError("minimumGpuInstances must be a non-negative safe integer.");
    }
    this.#onFallback = options.onFallback;
  }

  async cull(
    frustumPlanes: ArrayLike<number>,
    bounds: InstanceSphereBounds3D,
    output: InstanceVisibilityBuffer3D
  ): Promise<CapabilityGatedCullingResult3D> {
    const count = bounds.count ?? bounds.radii.length;
    if (this.#backend?.supported && count >= this.#minimumGpuInstances) {
      try {
        const visibility = await this.#backend.cull(frustumPlanes, bounds, output);
        if (visibility !== output) throw new Error("GPU culling backend must write the caller-owned output buffer.");
        if (!validOutput(output, count)) throw new Error("GPU culling backend returned invalid counters.");
        return { backend: "gpu", visibility };
      } catch (error) {
        try { this.#onFallback?.(error); } catch {}
      }
    }
    return { backend: "cpu", visibility: collectVisibleInstanceSpheres3D(frustumPlanes, bounds, output) };
  }
}

function validOutput(output: InstanceVisibilityBuffer3D, inputCount: number): boolean {
  return Number.isSafeInteger(output.count) && output.count >= 0 && output.count <= output.indices.length
    && Number.isSafeInteger(output.tested) && output.tested >= 0 && output.tested <= inputCount
    && Number.isSafeInteger(output.visible) && output.visible >= output.count && output.visible <= output.tested
    && output.truncated === output.visible - output.count;
}

export function createCapabilityGatedInstanceCuller3D(
  options: CapabilityGatedCullingOptions3D = {}
): CapabilityGatedInstanceCuller3D {
  return new CapabilityGatedInstanceCuller3D(options);
}
