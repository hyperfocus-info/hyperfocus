import { z } from 'zod';
import type { UniversalLocomotionBank } from '../universal-locomotion.ts';

const sample = z.record(z.string(), z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]));
const clip = z.object({ name: z.string(), duration: z.number().positive(), animation: z.number().int().nonnegative(), samples: z.array(sample).min(2) });
const schema = z.object({ source: z.string(), sha256: z.string().length(64), license: z.string(), legScale: z.number().positive(), footRestAngle: z.number().finite(),
  clips: z.array(clip.extend({ sourceStride: z.number().positive(), stride: z.number().positive() })).length(2),
  studies: z.array(clip.extend({ kind: z.enum(['idle', 'light', 'cross', 'hit']), contact: z.number().min(0).max(1) })).length(4) });

export function readDirectedBank(bytes: Uint8Array): UniversalLocomotionBank {
  const bank = schema.parse(JSON.parse(new TextDecoder().decode(bytes)));
  for (const clip of [...bank.clips, ...bank.studies]) for (const sample of clip.samples) {
    for (const name of ['pelvis', 'Head', 'neck_01', 'thigh_l', 'calf_l', 'foot_l', 'ball_l', 'thigh_r', 'calf_r', 'foot_r', 'ball_r', 'upperarm_l', 'lowerarm_l', 'hand_l', 'upperarm_r', 'lowerarm_r', 'hand_r']) if (!sample[name]) throw new Error(`Missing directed motion joint: ${name}`);
  }
  return bank;
}
