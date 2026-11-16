# 3D materials, maps, and looks

The first-party 3D path uses a glTF-aligned metallic/roughness material model. A
material can combine base color and emissive factors with five RGBA8 texture
slots: base color, packed metallic/roughness (blue/green), tangent-space normal,
occlusion (red), and emissive. One offset, tiling, and rotation transform applies
to all slots. The legacy `textureId` field remains a base-color alias.

Portable project materials may set `shader` to `pbr`, `toon`, `retro`, or
`hologram`. Opaque, alpha-mask, and alpha-blended transparency are supported;
`shading: "unlit"` remains the explicit lighting bypass. The WebGL2
backend renders configurable toon light bands, tinted shadows, rim light, a
back-face silhouette outline, retro color quantization/dither, and a scanline
hologram treatment without application-framework dependencies. Toon parameters
are portable material data, so gameplay, canonical preview, and video export do
not reconstruct the look in separate shaders.

Toon diffuse and rim contributions use the same inverse-pi light scale as PBR
diffuse, preserving color under the shared look recipes' key-light intensities.
Outline meshes must wind counterclockwise toward their outward normals. Portable
3D scenes may supply a finite RGBA `clearColor`; the editor's look action writes
this alongside the linked video's background so Play and standalone builds retain
the authored backdrop even without a video timeline.

`@hyperfocus/engine/render/3d-material-presets` provides 47 renderer-neutral
starting looks across fantasy, realistic, retro, toon, photoreal, and effects
families. Use `searchMaterialPresets3D`, `materialPreset3D`, and
`applyMaterialPreset3D` for gameplay. `sampleMaterialTransition3D` blends color,
emission, metalness, roughness, opacity, and UV transforms; shader, sidedness, and
texture references switch at the midpoint.

The editor exposes the same bank in the selected material inspector. Each texture
slot and the shared UV transform can then be replaced independently. Agents use
`scene3d.apply-material-preset`; 3D video materials accept a starting `preset` and
ordered `{ startFrame, durationFrames, toPreset }` transitions sampled on exact
frames.

Nine editor visual-direction recipes coordinate every scene material with the
bounded ambient/key/rim light rig and every linked video's background and post
settings. They preserve authored base colors and texture references, expand to
ordinary editable fields in one undo step, and are available to agents through
`scene3d.apply-look-recipe`.

Texture declarations consume decoded RGBA8 bytes. In the editor, **Use as 3D
texture** cooks an imported PNG, JPEG, WebP, or other browser-decodable image into
a hashed portable RGBA8 asset and immediately binds it to the active material's
base-color slot. Agents can register equivalent cooked pixels with
`scene3d.register-texture`. Compressed GPU
formats, separate UV sets, per-slot transforms, tangent vertex streams,
environment reflections, sorted order-independent transparency, and transmission
remain future extensions.

Hosts can replace the pixels of an existing declared texture with
`runtime.replaceTexture({ textureId, width, height, pixels })` and restore its
original pixels with `runtime.resetTexture({ textureId })`. Both preserve the
texture handle and authored sampler settings. Replacement copies decoded RGBA8
bytes and validates dimensions, exact byte length and the scene byte budget before
changing resources. Unknown IDs reject; this does not allocate extra texture slots
or change project data, physics or save snapshots. Hosts own decoding, approval
and allowed material targets. Apply approved texture IDs through ordinary frame
material looks; stop applying that override when hiding or revoking an image.

`scene.replaceTexture({ handle, width, height, pixels })` provides the same bounded
replacement for scene consumers. Each existing WebGL renderer detects the new
resource identity and replaces its GPU image on its next use. Reset unused images
to a small authored placeholder to release their CPU bytes. Every renderer also
purges replaced or destroyed GPU images on its next render, even when no material
uses them; unused replacement pixels are not uploaded. Renderer disposal releases
remaining GPU images. Reset itself does not synchronously invoke renderers.

## Related

- [Portable 3D runtime](portable-runtime-3d.md)
- [First-party WebGL2 renderer](first-party-3d-webgl2.md)
- [First-party 3D scene](first-party-3d-scene.md)
