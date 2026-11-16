import type { ParticleSystem3D } from '../../effects/particles3d/emitter.ts';
import type { BoundedScene3D, MeshGeometry3D } from '../3d-scene.ts';

export function particleQuad3D(): MeshGeometry3D {
  return { positions: new Float32Array([-.5, -.5, 0, .5, -.5, 0, .5, .5, 0, -.5, .5, 0]), normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]), uvs: new Float32Array([0, 1, 1, 1, 1, 0, 0, 0]), indices: new Uint16Array([0, 1, 2, 0, 2, 3]), label: 'Particle billboard quad' };
}
/** Scene owns resources; adapter owns only its instance/transform slots. Dispose before their mesh/material. */
export function createParticleSceneBinding3D(options: { scene: BoundedScene3D; system: ParticleSystem3D; mesh: number; material: number; facing: 'camera' | 'velocity' | 'mesh'; stretchSeconds?: number; maximumStretch?: number }) {
  const { scene, system } = options, transforms: number[] = [], instances: number[] = [], capacity = system.recipe.capacity;
  let disposed = false;
  const stretch = options.stretchSeconds ?? .03, maximum = options.maximumStretch ?? 4;
  if (!Number.isFinite(stretch) || stretch < 0 || stretch > 1 || !Number.isFinite(maximum) || maximum < 1 || maximum > 100) throw new Error('Invalid particle stretch');
  try {
    for (let i = 0; i < capacity; i++) {
      const transform = scene.transforms.create();transforms.push(transform);
      instances.push(scene.createInstance({ mesh: options.mesh, material: options.material, transform, visible: false }));
    }
  } catch (error) { dispose();throw error; }
  function dispose() { if (disposed) return;disposed = true;for (const instance of instances) scene.destroyInstance(instance);for (const transform of transforms) scene.destroyTransform(transform); }
  return {
    dispose,
    present(camera: readonly number[], density = 1) {
      if (disposed) throw new Error('Particle scene binding is disposed');
      if (camera.length !== 3 || camera.some(v => !Number.isFinite(v)) || !Number.isFinite(density) || density < 0 || density > 1) throw new Error('Invalid particle presentation');
      for (const instance of instances) scene.setInstanceVisible(instance, false);
      system.forEach(particle => {
        // Stable slot thinning changes rendering work, never simulation or gameplay.
        if ((Math.imul(particle.slot + 1, 2654435761) >>> 0) / 4294967296 >= density || particle.color[3] <= 0 || particle.size <= 0) return;
        const transform = transforms[particle.slot]!, instance = instances[particle.slot]!;
        scene.transforms.setPosition(transform, ...particle.position);
        if (options.facing === 'mesh') scene.transforms.setRotationQuaternion(transform, Math.sin(particle.rotation / 2) * .5773502691896258, Math.sin(particle.rotation / 2) * .5773502691896258, Math.sin(particle.rotation / 2) * .5773502691896258, Math.cos(particle.rotation / 2));
        else scene.transforms.setRotationQuaternion(transform, ...particleFacingQuaternion(particle.position, camera, options.facing === 'velocity' ? particle.velocity : [0, 1, 0], options.facing === 'velocity' ? 0 : particle.rotation));
        const length = options.facing === 'velocity' ? Math.min(particle.size * maximum, Math.max(particle.size, Math.hypot(...particle.velocity) * stretch)) : particle.size;
        scene.transforms.setScale(transform, particle.size, length, particle.size);
        scene.setInstanceAppearance(instance, { color: particle.color, uvRect: particle.uv });scene.setInstanceVisible(instance, true);
      });
    },
  };
}

export function particleFacingQuaternion(position: readonly number[], camera: readonly number[], up: readonly number[], roll: number): [number, number, number, number] {
  let zx = camera[0]! - position[0]!, zy = camera[1]! - position[1]!, zz = camera[2]! - position[2]!;
  const length = Math.hypot(zx, zy, zz);if (length < .000001) return [0, 0, 0, 1];zx /= length;zy /= length;zz /= length;
  let xx = up[1]! * zz - up[2]! * zy, xy = up[2]! * zx - up[0]! * zz, xz = up[0]! * zy - up[1]! * zx;
  let side = Math.hypot(xx, xy, xz);
  if (side < .000001) { const fallback = Math.abs(zy) < .95 ? [0, 1, 0] : [1, 0, 0];xx = fallback[1]! * zz - fallback[2]! * zy;xy = fallback[2]! * zx - fallback[0]! * zz;xz = fallback[0]! * zy - fallback[1]! * zx;side = Math.hypot(xx, xy, xz); }
  xx /= side;xy /= side;xz /= side;
  const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx, c = Math.cos(roll), s = Math.sin(roll);
  const m00 = xx * c + yx * s, m10 = xy * c + yy * s, m20 = xz * c + yz * s, m01 = yx * c - xx * s, m11 = yy * c - xy * s, m21 = yz * c - xz * s;
  const trace = m00 + m11 + zz;
  if (trace > 0) { const q = Math.sqrt(trace + 1) * 2;return [(m21 - zy) / q, (zx - m20) / q, (m10 - m01) / q, q / 4]; }
  if (m00 > m11 && m00 > zz) { const q = Math.sqrt(1 + m00 - m11 - zz) * 2;return [q / 4, (m01 + m10) / q, (zx + m20) / q, (m21 - zy) / q]; }
  if (m11 > zz) { const q = Math.sqrt(1 + m11 - m00 - zz) * 2;return [(m01 + m10) / q, q / 4, (zy + m21) / q, (zx - m20) / q]; }
  const q = Math.sqrt(1 + zz - m00 - m11) * 2;return [(zx + m20) / q, (zy + m21) / q, q / 4, (m10 - m01) / q];
}
