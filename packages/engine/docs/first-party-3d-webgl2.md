# First-party WebGL2 backend

`src/render/3d-webgl2.ts` is the first browser backend for the engine-owned 3D core. It consumes `RenderCommandBuffer3D` directly and has no runtime dependencies.

The backend is a usable compact PBR baseline. Existing unlit materials remain compatible, while lit materials use metallic-roughness direct lighting from ambient, up to two directional lights and eight finite-range point lights plus glTF-aligned base-color, packed metallic/roughness, normal, occlusion, and emissive RGBA8 maps. It provides:

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
- configurable graphic-cel bands, shadow tint, rim light, and an expanded back-face silhouette outline pass;
- optional blended-material `cutaway` edges in the existing fragment pass;
- opaque, alpha-mask, and conventional source-alpha blended material modes;
- emissive color, Schlick Fresnel, GGX distribution, Smith geometry, accumulated ambient light, two directional and eight point contributions from the compiled scene-light buffer;
- canvas backing-buffer resize, device-pixel-ratio caps, and maximum dimensions;
- shader compile and program link errors containing driver logs and numbered shader source;
- context-loss pause, restoration, lazy mesh re-upload, and generation telemetry; and
- explicit disposal of programs, vertex arrays, and buffers.

## Minimal use

`Material3D.cutaway` replaces a blended surface's low-alpha interior with thin
mesh boundary and crease edges. Alpha at or below .42 leaves edges only; the fill
returns smoothly through .95. It preserves depth testing and disables depth
writes with the existing blend mode. This is a mesh-edge treatment, not an x-ray
silhouette of objects behind a wall. Coplanar triangle seams are removed at upload;
curved faceted geometry can still show its facet edges. The expanded vertex streams
are cached by immutable mesh identity, including skin/morph attributes. Each
renderer retains at most one ordinary and one cutaway GPU record per mesh handle;
both follow handle replacement, context recovery and disposal. The cutaway uses
attribute 15, adds upload memory on first use, and adds no entities or draw passes.
Cutaways draw both faces even on single-sided source materials, so entering a
vehicle or wall retains its remaining visible edges. They test depth without
writing it; leaving the cutaway restores the material's ordinary culling.

The main pass draws opaque and masked commands before blended commands. Opaque
order is preserved; transparent instance centres are sorted globally from back to
front, retaining instancing for adjacent compatible draw state. Blended commands
test depth but do not write it. Centre sorting cannot resolve intersecting
translucent surfaces, which still require deliberate authoring.

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

scene.compile(frame);
renderer.render(frame, viewProjection, {
  cameraPosition: camera.eye,
  shadowViewProjection: directionalLightViewProjection,
  shadowBias: 0.001,
});
```

`maxInstances` is independent from the scene and command-buffer limits. Rendering fails with an actionable range error if a command buffer exceeds the GPU allocation. `maxTextureSize` is clamped to the driver's `MAX_TEXTURE_SIZE`; oversized textures fail before upload. The renderer uploads only the accepted matrix range each frame. Mesh and texture arrays remain borrowed by the scene and are uploaded lazily the first time their handles are drawn.

Enable camera culling with `cameraCulling: true`; the default retains the full
submitted stream. It filters the sorted packet using that packet's matrices,
including conservative sphere support for affine shear and toon-outline padding.
The full sorted stream remains available to directional shadows; explicitly
supplied `shadowCommands` retain precedence. Compile a full packet when the same
packet supplies shadows, since geometry omitted by the caller cannot cast them.

The culler preserves mesh, material and texture liveness checks. Invalid resources,
skinning/morph deformation and unsupported matrices keep the original packet and
its validation path. Its reusable output is capacity-bounded; cached geometric
bounds rely on the existing immutable-mesh contract. Testing and copying can add
CPU work in fully visible scenes. The [full-loop comparison](../examples/touch-of-death/docs/touch-of-death-standard-primitives.md)
reduced GPU work in both measured arenas but established a fresh-motion gain in
only one; it does not justify enabling this strategy for every workload.

The shader palette is fixed at renderer creation. Its default is the scene's `jointsPerSkeleton`; `maxJointsPerSkeleton` can apply a smaller software bound. Initialization queries `MAX_VERTEX_UNIFORM_VECTORS`, reserves the vectors used by other vertex uniforms, and rejects a requested palette above the exact remaining matrix capacity. A skeleton above the configured renderer limit fails before drawing; there is no silent CPU fallback or palette truncation. Static and skinned commands share the material shader while retaining valid attribute state on both paths.

By default, backing resolution follows `canvas.clientWidth`, `canvas.clientHeight`, and the browser device pixel ratio, capped at 2 and 8192 pixels per dimension. These limits are configurable. CSS sizing remains owned by the application.

`render()` returns one stable mutable statistics object, including main, outline, and shadow draw calls, instances, primitive counts, mesh and texture uploads, material and texture bindings, palette uploads and matrices, skinned draw/instance counts, consumed ambient, directional and point lights, unsupported light count, upload bytes, drawing-buffer dimensions, and context generation. Copy it if historical frame data is needed. Development or acceptance builds may set `validateGlErrors: true` for slow, stage-specific GL error diagnostics.

Point contributions use world position, authored range and intensity with squared
finite-range attenuation; they have no point shadow pass. Light counts describe
the scene once, independently of the outline pass. Newly uploaded or replaced maps
keep their selected sampler unit, so first-use pixels match warmed draws.
Directional shadow coverage follows material opacity with ordered 4-by-4 coverage;
zero-opacity surfaces cast no shadow. Texture alpha-mask silhouettes remain a
separate unsupported shadow feature.

Shadow resources are allocated only when `directionalShadowMapSize` is configured. Passing `shadowViewProjection` renders all submitted geometry into that bounded depth map before the main pass. The depth pass applies slope-scaled polygon offset and restores it before color rendering, preventing steep surfaces from self-shadowing in bands without requiring a large contact-detaching constant bias. Four depth-comparison samples at sub-texel offsets soften stair-stepped edges; their footprint follows the allocated map resolution, with no extra render target or pass. `shadowBias` is finite and limited to `0..0.05`. Morph positions are exact-size `Float32Array` deltas stored with each mesh; the renderer reads the mesh's live `morphWeights` on every draw, so callers can animate weights without replacing GPU geometry.

## Context lifecycle

The renderer prevents the default `webglcontextlost` behavior so the browser can restore the context. Draws are skipped while lost. On `webglcontextrestored`, shaders, the bounded palette program, the fallback texture, and the fixed instance buffer are rebuilt immediately; mesh, skin-stream, and project texture resources are uploaded lazily on subsequent draws, while current caller-owned palettes are uploaded on their next command. Diagnostics distinguish loss, successful restoration, and restoration failure.

Call `dispose()` before discarding a canvas. It removes context listeners and deletes live GPU resources. Rendering after disposal is an error.

## Canonical frame and render graph

Gameplay and video use the same portable scene cooker, `sample3DFrame`, `RenderCommandBuffer3D`, material implementation, and WebGL2 base renderer. Gameplay normally requests the `gameplay` graph (base, alpha modes, lighting, optional shadows). Video may request the bounded `video-safe` graph (base plus fog, bloom, exposure, grain, vignette, impact-frame treatment, and transition composition). Those differences are visible frame data, not alternate Three.js behavior.

Impact frames intentionally sit after the WebGL2 base image in the first-party host compositor. Play, standalone Build, canonical preview, and export import that one compositor and consume the `impactFrame` request emitted by `sample3DFrame`. Scene-threshold, edge, color-separation, brush-mark, and cooked-still treatments therefore do not create a second renderer or change material interpretation. Their output is deterministic for the same source pixels, dimensions, cue seed, and frame; GPU-produced source pixels retain the cross-device tolerance caveat below.

The editor's Three.js viewport remains a labeled authoring proxy. It is not used by canonical preview, MP4 export, Play, or standalone builds. Canonical video setup hydrates and validates the same `hyperfocus3D` assets as runtime creation; there is no late `GLTFLoader` delivery fallback. Encoding remains downstream of rendered frames, so MediaRecorder timing never defines the animation clock.

## Exact limitations

This backend is intentionally basic and must not be described as the finished 3D renderer:

- PBR is a direct-lighting subset: accumulated ambient, two directional lights, eight finite-range point lights, metallic-roughness parameters, and emissive color. Spot and excess point/directional lights are counted as unsupported by this backend.
- The five standard map slots share one UV offset/tiling/rotation transform. There are no compressed texture uploads, streaming, atlasing, anisotropy, per-slot UV transforms, secondary UV sets, or environment-map reflections yet.
- Directional shadows use four bounded depth-comparison samples per fragment. Cascades, larger PCF kernels, point/spot shadows, texture-alpha-mask-aware shadow silhouettes, image-based lighting, environment maps, and light probes remain unsupported.
- Skinning is four-weight linear matrix blending only. The separate vendor-neutral glTF skin/animation cooker supplies bounded bone hierarchies, inverse-bind evaluation, and LINEAR/STEP TRS clips. Morph target position deltas can combine with skinning, but glTF weight animation, normal/tangent morphs, dual-quaternion skinning, and animation textures remain unsupported by the base pass. Fog, bloom, exposure, grain, vignette, and transitions are explicit first-party presentation passes requested by the canonical frame; they are not hidden base-shader approximations.
- One uniform palette is bound per draw command. Instances can batch only when they share the same skeleton handle, and palette size is bounded by vertex-uniform hardware limits.
- Blended transparency uses conventional source-alpha blending with instance-centre depth sorting, not order-independent transparency; intersecting translucent geometry can therefore show ordering artifacts.
- There is one camera and one color/depth target per render call.
- Resource mutation inside borrowed mesh arrays is unsupported. Replace the mesh record to force upload.
- Context restoration is covered, but deliberate cross-context sharing and worker/offscreen-canvas rendering are not.

## Browser acceptance fixture

Run the dependency-free fixture:

```sh
bun examples/first-party-3d-webgl/server.ts
```

Open `http://127.0.0.1:8796/`. It renders four depth-tested,
ambient/directional-lit and morph-animated cubes, including a configurable
graphic-cel outline, an alpha-masked checker texture, a directional shadow depth
pass, and a caller-animated two-joint skinned ribbon. It exposes
`window.__firstParty3D.snapshot()` for automation.

For headless acceptance and a screenshot:

```sh
bun examples/first-party-3d-webgl/capture.ts
```

The capture validates non-zero main/shadow draws, instances, triangles, drawing-buffer dimensions, texture and palette uploads, both supported light types, a changing skeletal pose, and a zero GL error state. When `WEBGL_lose_context` is available, it also performs a real loss/restoration round trip and checks that the context generation advances before writing `.local/first-party-3d-webgl/acceptance.png`.
