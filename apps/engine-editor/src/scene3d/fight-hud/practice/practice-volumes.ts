import type { CombatProject3D, GameplaySnapshot3D } from '@hyperfocus/engine/project/runtime-3d';

export function projectPracticePoint(p: readonly number[], m: ArrayLike<number>, width: number, height: number) {
  const w = m[3]! * p[0]! + m[7]! * p[1]! + m[11]! * p[2]! + m[15]!;
  const z = m[2]! * p[0]! + m[6]! * p[1]! + m[10]! * p[2]! + m[14]!;
  if (w <= 0 || Math.abs(z / w) > 1) return undefined;
  return { x: ((m[0]! * p[0]! + m[4]! * p[1]! + m[8]! * p[2]! + m[12]!) / w + 1) * width / 2,
    y: (1 - (m[1]! * p[0]! + m[5]! * p[1]! + m[9]! * p[2]! + m[13]!) / w) * height / 2 };
}

/** Wire volumes use the same spheres and upward capsules as combat; never affect simulation. */
export function drawPracticeVolumes(options: { context: CanvasRenderingContext2D; matrix: ArrayLike<number>; width: number; height: number; snapshot: GameplaySnapshot3D; definition: CombatProject3D }) {
  const { context: ctx, matrix, width, height, definition } = options;
  function sphere(center: readonly number[], radius: number, color: string, dashed: boolean) {
    ctx.strokeStyle = color;ctx.lineWidth = 2;ctx.setLineDash(dashed ? [4, 4] : []);
    for (let plane = 0; plane < 3; plane++) {
      ctx.beginPath();let started = false;
      for (let i = 0; i <= 40; i++) {
        const point = [...center], angle = i / 40 * Math.PI * 2;
        point[plane] = point[plane]! + Math.cos(angle) * radius;
        point[(plane + 1) % 3] = point[(plane + 1) % 3]! + Math.sin(angle) * radius;
        const screen = projectPracticePoint(point, matrix, width, height);
        if (!screen) { started = false;continue; }
        if (started) ctx.lineTo(screen.x, screen.y);else ctx.moveTo(screen.x, screen.y);
        started = true;
      }
      ctx.stroke();
    }
  }
  ctx.save();
  for (const fighter of options.snapshot.combat?.state.fighters ?? []) {
    const p = fighter.position;
    sphere([p.x, p.y, p.z], definition.config.hurtRadius, fighter.protectionFrames ? '#ffffff' : '#61f4c2', fighter.protectionFrames > 0);
    const move = definition.config.moves.find(item => item.id === fighter.moveId);
    if (move && fighter.health > 0 && !fighter.stunFrames && fighter.moveFrame >= move.startupFrames && fighter.moveFrame < move.startupFrames + move.activeFrames
      && (move.damage || move.hitstunFrames || move.impulse || move.verticalImpulse || move.guardDamage)) {
      const center = [p.x + fighter.facing.x * move.reach, p.y + fighter.facing.y * move.reach, p.z + fighter.facing.z * move.reach];
      sphere(center, move.hitRadius, '#ff856e', false);
      if (move.hitHeight) {
        sphere([center[0]!, center[1]! + move.hitHeight, center[2]!], move.hitRadius, '#ff856e', false);
        ctx.beginPath();
        for (const [dx, dz] of [[move.hitRadius, 0], [-move.hitRadius, 0], [0, move.hitRadius], [0, -move.hitRadius]]) {
          const bottom = projectPracticePoint([center[0]! + dx!, center[1]!, center[2]! + dz!], matrix, width, height);
          const top = projectPracticePoint([center[0]! + dx!, center[1]! + move.hitHeight, center[2]! + dz!], matrix, width, height);
          if (bottom && top) { ctx.moveTo(bottom.x, bottom.y);ctx.lineTo(top.x, top.y); }
        }
        ctx.stroke();
      }
    }
  }
  ctx.restore();
}
