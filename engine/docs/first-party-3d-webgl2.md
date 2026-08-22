# First-party WebGL2 backend

`src/render/3d-webgl2.ts` is the first browser backend for the engine-owned 3D core. It consumes `RenderCommandBuffer3D` directly and has no runtime dependencies.

The backend is a usable compact PBR baseline. Existing unlit materials remain compatible, while lit materials use metallic-roughness direct lighting from ambient and one directional light plus an RGBA8 base-color texture. It provides:

- WebGL2 feature checking and explicit initialization failure;
- depth testing, back-face culling, opaque drawing, and alpha-mask discard;
- instanced indexed and non-indexed triangle or line draws;
- one optional depth-texture shadow pass for the first directional light;
- one through four caller-weighted position-delta morph targets, applied before skinning;
- bounded linear-blend skinning from `JOINTS_0`/`WEIGHTS_0`, including instancing when instances share one palette;
- bounded matrix uploads controlled by `maxInstances`;
- position, normal, UV, joint, weight, and index uploads with mesh GPU caching and handle-reuse invalidation;
- bounded RGBA8 texture uploads, nearest/linear filtering, clamp/repeat wrapping, optional mipmaps, and handle-reuse invalidation;
- packed unlit or metallic-roughness material uniforms with within-frame material-state caching;
- emissive color, Schlick Fresnel, GGX distribution, Smith geometry, accumulated ambient light, and first-directional direct lighting from the compiled scene-light buffer;
- canvas backing-buffer resize, device-pixel-ratio caps, and maximum dimensions;
- shader compile and program link errors containing driver logs and numbered shader source;
- context-loss pause, restoration, lazy mesh re-upload, and generation telemetry; and
- explicit disposal of programs, vertex arrays, and buffers.

## Minimal use

```ts
const renderer = createWebGl2Renderer3D({
  canvas,
  scene,
  maxInstances: 5_000,
  maxDevicePixelRatio: 2,
  maxDrawingBufferWidth: 8192,
  maxDrawingBufferHeight: 8192,
  maxTextureSize: 4096,
  maxJointsPerSkeleton: 64,
  directionalShadowMapSize: 2048,
  onDiagnostic(diagnostic) {
    console[diagnostic.level === "error" ? "error" : "warn"](diagnostic.message);
  }
});

scene.compile(frame, { frustumPlanes });
renderer.render(frame, viewProjection, {
  cameraPosition: camera.eye,
  shadowViewProjection: directionalLightViewProjection,
  shadowBias: 0.001,
});
```

`maxInstances` is independent from the scene and command-buffer limits. Rendering fails with an actionable range error if a command buffer exceeds the GPU allocation. `maxTextureSize` is clamped to the driver's `MAX_TEXTURE_SIZE`; oversized textures fail before upload. The renderer uploads only the accepted matrix range each frame. Mesh and texture arrays remain borrowed by the scene and are uploaded lazily the first time their handles are drawn.

The shader palette is fixed at renderer creation. Its default is the scene's `jointsPerSkeleton`; `maxJointsPerSkeleton` can apply a smaller software bound. Initialization queries `MAX_VERTEX_UNIFORM_VECTORS`, reserves the vectors used by other vertex uniforms, and rejects a requested palette above the exact remaining matrix capacity. A skeleton above the configured renderer limit fails before drawing; there is no silent CPU fallback or palette truncation. Static and skinned commands share the material shader while retaining valid attribute state on both paths.

By default, backing resolution follows `canvas.clientWidth`, `canvas.clientHeight`, and the browser device pixel ratio, capped at 2 and 8192 pixels per dimension. These limits are configurable. CSS sizing remains owned by the application.

`render()` returns one stable mutable statistics object, including main and shadow draw calls, instances, primitive counts, mesh and texture uploads, material and texture bindings, palette uploads and matrices, skinned draw/instance counts, consumed ambient and directional lights, unsupported light count, upload bytes, drawing-buffer dimensions, and context generation. Copy it if historical frame data is needed. Development or acceptance builds may set `validateGlErrors: true` for slow, stage-specific GL error diagnostics.

Shadow resources are allocated only when `directionalShadowMapSize` is configured. Passing `shadowViewProjection` renders all submitted geometry into that bounded depth map before the main pass. `shadowBias` is finite and limited to `0..0.05`. Morph positions are exact-size `Float32Array` deltas stored with each mesh; the renderer reads the mesh's live `morphWeights` on every draw, so callers can animate weights without replacing GPU geometry.

## Context lifecycle

The renderer prevents the default `webglcontextlost` behavior so the browser can restore the context. Draws are skipped while lost. On `webglcontextrestored`, shaders, the bounded palette program, the fallback texture, and the fixed instance buffer are rebuilt immediately; mesh, skin-stream, and project texture resources are uploaded lazily on subsequent draws, while current caller-owned palettes are uploaded on their next command. Diagnostics distinguish loss, successful restoration, and restoration failure.

Call `dispose()` before discarding a canvas. It removes context listeners and deletes live GPU resources. Rendering after disposal is an error.

## Exact limitations

This backend is intentionally basic and must not be described as the finished 3D renderer:

- PBR is a direct-lighting subset: accumulated ambient plus the first directional light, metallic-roughness parameters, and emissive color. Point, spot, and additional directional lights are counted as unsupported by this backend.
- Base-color RGBA8 is the only texture channel. There are no normal, metallic-roughness, occlusion, or emissive texture channels, compressed texture upload, streaming, atlasing, anisotropy, or color-space selection yet.
- Directional shadows use one hardware depth comparison per fragment. Cascades, PCF kernels, point/spot shadows, alpha-mask-aware shadow silhouettes, image-based lighting, environment maps, and light probes remain unsupported.
- Skinning is four-weight linear matrix blending only. The separate vendor-neutral glTF skin/animation cooker supplies bounded bone hierarchies, inverse-bind evaluation, and LINEAR/STEP TRS clips. Morph target position deltas can combine with skinning, but glTF weight animation, normal/tangent morphs, dual-quaternion skinning, animation textures, fog, and post-processing remain unsupported.
- One uniform palette is bound per draw command. Instances can batch only when they share the same skeleton handle, and palette size is bounded by vertex-uniform hardware limits.
- Blended transparency is unsupported by the scene command contract.
- There is one camera and one color/depth target per render call.
- Resource mutation inside borrowed mesh arrays is unsupported. Replace the mesh record to force upload.
- Context restoration is covered, but deliberate cross-context sharing and worker/offscreen-canvas rendering are not.

## Browser acceptance fixture

Run the dependency-free fixture:

```sh
bun examples/first-party-3d-webgl/server.ts
```

Open `http://127.0.0.1:8796/`. It renders four depth-tested, ambient/directional-lit and morph-animated cubes, an alpha-masked checker texture, a directional shadow depth pass, and a caller-animated two-joint skinned ribbon. It exposes `window.__firstParty3D.snapshot()` for automation.

For headless acceptance and a screenshot:

```sh
bun examples/first-party-3d-webgl/capture.ts
```

The capture validates non-zero main/shadow draws, instances, triangles, drawing-buffer dimensions, texture and palette uploads, both supported light types, a changing skeletal pose, and a zero GL error state. When `WEBGL_lose_context` is available, it also performs a real loss/restoration round trip and checks that the context generation advances before writing `.local/first-party-3d-webgl/acceptance.png`.
