import type { BoundedScene3D, RenderCommandBuffer3D } from '../render/3d-scene.ts';
const commandArrays = ['commandMeshHandles','commandMaterialHandles','commandFirstInstances','commandInstanceCounts','commandSkeletonHandles','commandFlags','instanceSceneHandles','instanceMatrices','lightTypes','lightSceneHandles','lightData'] as const;
const sceneArrays = ['materialData','materialFlags','materialTextureHandles','skeletonMatrices'] as const;
const counters = ['commandCount','instanceCount','lightCount','testedInstances','visibleInstances','culledInstances','filteredInstances','invalidTransformInstances','invalidSkeletonInstances','truncatedInstances','commandLimitedInstances','matchingLights','truncatedLights'] as const;

/** Fixed layout per initialized scene. Transferred packets own their storage independently of the live world. */
export function createRenderFramePacket3D(options: { commands: RenderCommandBuffer3D; scene: BoundedScene3D }) {
  const entries = [...commandArrays.map(key => ({ owner: 'commands' as const, key, template: options.commands[key] })), ...sceneArrays.map(key => ({ owner: 'scene' as const, key, template: options.scene[key] }))];
  let bytes = 64;
  const fields = entries.map(entry => { const offset = bytes;bytes += entry.template.byteLength;return { ...entry, offset }; });
  const appearanceOffset = bytes;bytes += options.commands.instanceSceneHandles.length * 32;
  const signature = fields.reduce((hash, field) => Math.imul(hash ^ field.template.length, 16777619), 2166136261) >>> 0;
  function validate(buffer: ArrayBuffer) { if (buffer.byteLength !== bytes) throw Error('Render frame packet has the wrong capacity.'); }
  return {
    byteLength: bytes,
    write(input: { buffer: ArrayBuffer; commands: RenderCommandBuffer3D; scene: BoundedScene3D }) {
      validate(input.buffer);
      for (const field of fields) {
        const source = field.owner === 'commands' ? input.commands[field.key] : input.scene[field.key];
        if (source.byteLength !== field.template.byteLength) throw Error('Render frame packet layout changed.');
      }
      if (input.commands.instanceAppearance && input.commands.instanceAppearance.length !== options.commands.instanceSceneHandles.length * 8) throw Error('Render frame packet appearance capacity changed.');
      const header = new Uint32Array(input.buffer, 0, 16);header[0] = signature;header[1] = input.commands.instanceAppearance ? 1 : 0;header[15] = 1;
      for (let i = 0; i < counters.length; i++) header[i + 2] = input.commands[counters[i]!];
      for (const field of fields) {
        const source = field.owner === 'commands' ? input.commands[field.key] : input.scene[field.key];
        new Uint8Array(input.buffer, field.offset, source.byteLength).set(new Uint8Array(source.buffer, source.byteOffset, source.byteLength));
      }
      if (input.commands.instanceAppearance) new Float32Array(input.buffer, appearanceOffset, options.commands.instanceSceneHandles.length * 8).set(input.commands.instanceAppearance);
    },
    read(input: { buffer: ArrayBuffer; scene: BoundedScene3D }) {
      validate(input.buffer);
      const header = new Uint32Array(input.buffer, 0, 16);
      if (header[15] !== 1 || header[0] !== signature || header[1]! > 1 || header[2]! > options.commands.commandMeshHandles.length || header[3]! > options.commands.instanceSceneHandles.length || header[4]! > options.commands.lightTypes.length) throw Error('Render frame packet header is invalid.');
      for (const field of fields) if (field.owner === 'scene' && input.scene[field.key].byteLength !== field.template.byteLength) throw Error('Render frame packet destination layout changed.');
      const commands = { ...options.commands };
      for (let i = 0; i < counters.length; i++) commands[counters[i]!] = header[i + 2]!;
      for (const field of fields) {
        const view = field.template instanceof Float32Array ? new Float32Array(input.buffer, field.offset, field.template.length) : field.template instanceof Int32Array ? new Int32Array(input.buffer, field.offset, field.template.length) : new Uint32Array(input.buffer, field.offset, field.template.length);
        if (field.owner === 'scene') input.scene[field.key].set(view);
        // The fixed field table preserves each original typed-array constructor and checked capacity.
        else Reflect.set(commands, field.key, view);
      }
      commands.instanceAppearance = header[1] ? new Float32Array(input.buffer, appearanceOffset, options.commands.instanceSceneHandles.length * 8) : undefined;
      return commands;
    },
  };
}
