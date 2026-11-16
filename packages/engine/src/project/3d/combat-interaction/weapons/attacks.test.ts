import { expect, test } from 'bun:test';
import { createTouchOfDeathPreset } from '../../../../combat/touch-of-death.ts';
import { createCombatSimulation } from '../../../../combat/simulation.ts';
import { readCombatConfig } from '../../../../combat/read.ts';
import type { CombatInput } from '../../../../combat/state.ts';
import { createCombatInteractions } from '../session.ts';
import { synthesizeWeaponAttacks, weaponAttackMove } from './attacks.ts';

function fixture() {
  const config = createTouchOfDeathPreset();
  for (const [id, source] of [['staff-light','jab'],['staff-heavy','heavy']] as const) {
    const move = config.moves.find(move => move.id === source)!;
    config.moves.push({ ...structuredClone(move), id, command: [id], direction: undefined, drive: undefined, damage: move.damage * 1.5, cancels: [] });
  }
  const weapon = { entityId: 'staff', material: 'wood' as const, durability: 100, length: 2.2, lightMoveId: 'staff-light', heavyMoveId: 'staff-heavy' };
  synthesizeWeaponAttacks({ config, weapons: [weapon] });
  const sim = createCombatSimulation({ config, fighters: [{ id: 'a', position: { x: 0,y: 1,z: 0 } }, { id: 'b', position: { x: 20,y: 1,z: 0 } }] });
  const session = createCombatInteractions({ config, fighterIds: ['a','b'], positions: new Map([['staff',{x:1,y:1,z:0}]]), definition: { weapons: [weapon] } });
  const saved = session.capture();saved.weapons[0]!.owner = 'a';session.restore(saved);
  const step = (input: CombatInput) => {
    const state = sim.capture();session.before(state,[input]);sim.restore({snapshot:state});
    const events = sim.step({inputs:[input]});const after = sim.capture();session.after(after,[input],events);sim.restore({snapshot:after});return after.fighters[0]!;
  };
  return {config,weapon,sim,session,step};
}

test('weapon synthesis is idempotent, portable, and preserves twelve dash roles with inspectable values', () => {
  const f = fixture(), once = JSON.stringify(f.config);
  synthesizeWeaponAttacks({config:f.config,weapons:[f.weapon]});expect(JSON.stringify(f.config)).toBe(once);
  expect(readCombatConfig(f.config)).toEqual(f.config);
  const originals = f.config.moves.filter(move=>move.dashAttack&&!move.weaponAttack);
  expect(originals).toHaveLength(12);
  for (const source of originals) {
    const physical = weaponAttackMove(f.config,source,f.weapon);
    expect(physical.weaponSourceMoveId).toBe(source.id);expect(physical.dashAttack).toBe(true);
    expect(physical.direction).toBe(source.direction);expect(physical.drive).toBe(source.drive);
    expect(physical.hitstunFrames).toBe(source.hitstunFrames);expect(physical.activeMovementSpeed).toBe(source.activeMovementSpeed);
    expect(physical.reach).toBe(f.weapon.length);expect(physical.damage).toBe(source.damage*1.5);
  }
});

test('older weapon timing cannot leave a source follow-up outside the synthesized attack duration', () => {
  const f=fixture(), base=f.config.moves.find(move=>move.id==='staff-light')!;
  base.startupFrames=2;base.activeFrames=1;base.recoveryFrames=2;
  synthesizeWeaponAttacks({config:f.config,weapons:[f.weapon]});
  expect(()=>readCombatConfig(f.config)).not.toThrow();
  expect(f.config.moves.find(move=>move.id==='staff-light')!.startupFrames).toBe(f.config.moves.find(move=>move.id==='jab')!.startupFrames);
});

test('combat tools keep hit-only routes inside their shorter confirmed recovery', () => {
  const f = fixture(), base = f.config.moves.find(move => move.id === 'staff-light')!;
  const weapon = { ...f.weapon, kit: 'combat' as const };
  base.startupFrames = 5;base.activeFrames = 3;base.recoveryFrames = 2;base.hitRecoveryFrames = 2;
  synthesizeWeaponAttacks({ config: f.config, weapons: [weapon] });
  expect(() => readCombatConfig(f.config)).not.toThrow();
  for (const move of f.config.moves.filter(move => move.weaponBaseMoveId === 'staff-light')) {
    expect(move.hitRecoveryFrames).toBeLessThanOrEqual(move.recoveryFrames);
    for (const cancel of move.cancels.filter(cancel => cancel.hitOnly)) {
      expect(cancel.fromFrame).toBe(move.startupFrames + move.activeFrames);
      expect(cancel.toFrame).toBeLessThan(move.startupFrames + move.activeFrames + move.hitRecoveryFrames!);
    }
  }
});

test('all twelve actual command selections use the held tool and heavy variants wear more', () => {
  for (const direction of ['neutral','toward','away'] as const) for (const drive of [false,true]) for (const key of ['jab','heavy'] as const) {
    const f=fixture(), source=f.config.moves.find(move=>move.dashAttack&&!move.weaponAttack&&move.direction===direction&&move.drive===drive&&move.command[0]===key)!;
    const actor=f.step({fighterId:'a',pressed:[key],held:[key],dashing:true,drive,direction:{x:direction==='neutral'?0:direction==='toward'?1:-1,y:0,z:0}});
    const selected=f.config.moves.find(move=>move.id===actor.moveId)!;
    expect(selected.weaponSourceMoveId).toBe(source.id);
    expect(f.session.capture().weapons[0]!.durability).toBe(source.pose==='back-hop'?100:key==='heavy'?95:99);
  }
});

test('held Heavy accelerates the weapon dive and fresh Drive follows the armed back hop', () => {
  const f=fixture();f.step({fighterId:'a',pressed:['heavy'],held:['heavy'],dashing:true,drive:true,direction:{x:1,y:0,z:0}});
  let actor=f.sim.capture().fighters[0]!;
  for(let i=0;i<4;i++) actor=f.step({fighterId:'a',held:['heavy'],drive:true});
  expect(actor.chargeFrames).toBeGreaterThan(0);expect(actor.moveFrame).toBeGreaterThan(actor.chargeFrames);
  const g=fixture();g.step({fighterId:'a',pressed:['heavy'],held:['heavy','drive'],dashing:true,drive:true,direction:{x:-1,y:0,z:0}});
  for(let i=0;i<8;i++)g.step({fighterId:'a',held:['drive'],drive:true});
  expect(g.sim.capture().fighters[0]!.moveId).toContain('dash-drive-heavy-away');
  g.step({fighterId:'a',held:[],drive:false});actor=g.step({fighterId:'a',pressed:['drive'],held:['drive'],drive:true});
  expect(g.config.moves.find(move=>move.id===actor.moveId)!.weaponSourceMoveId).toBe('dash-wheel-kick');
  expect(g.session.capture().weapons[0]!.durability).toBe(95);
});
