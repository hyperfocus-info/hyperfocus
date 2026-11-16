import { expect, test } from 'bun:test';
import { createCombatSimulation } from './simulation.ts';
import { createTouchOfDeathPreset } from './touch-of-death.ts';
import { readCombatConfig } from './read.ts';
import type { CombatEvent } from './state.ts';

const flurryStartup = createTouchOfDeathPreset().moves.find(move => move.id === 'flurry')!.startupFrames;
const fighters = [{ id: 'a', position: { x: 0, y: 0, z: 0 } }, { id: 'b', position: { x: 1, y: 0, z: 0 }, facing: { x: -1, y: 0, z: 0 } }];

test('Touch of Death accepts six-frame parries and six-frame collision techs at explicit boundaries', () => {
  for (const pressFrame of [0, 1]) {
    const sim = createCombatSimulation({ config: createTouchOfDeathPreset(), fighters });
    let events: CombatEvent[] = [];
    for (let frame = 0; frame <= flurryStartup; frame++) events = sim.step({ inputs: [{ fighterId: 'a', pressed: frame === 0 ? ['flurry'] : [] }, { fighterId: 'b', guard: frame >= flurryStartup - createTouchOfDeathPreset().parryFrames! + pressFrame }] });
    expect(events[0]?.kind).toBe(pressFrame === 1 ? 'parry' : 'block');
  }
  for (const impactFrame of [5, 6]) {
    const sim = createCombatSimulation({ config: createTouchOfDeathPreset(), fighters });
    const snapshot = sim.capture();Object.assign(snapshot.fighters[1]!, { stunKind: 'hit', stunFrames: 45 });sim.restore({ snapshot });
    sim.step({ inputs: [{ fighterId: 'b', tech: true }] });
    for (let frame = 1; frame < impactFrame; frame++) sim.step();
    expect(sim.step({ collisions: [{ fighterId: 'b', normal: { x: 0, y: 1, z: 0 } }] })[0]?.kind).toBe(impactFrame === 5 ? 'tech' : 'bounce');
  }
});

test('successful parry clears the attack string and grants a real punish before mash can restart', () => {
  const config = { ...createTouchOfDeathPreset(), parryRecoveryFrames: 20 };
  const sim = createCombatSimulation({ config, fighters });
  sim.step({ inputs: [{ fighterId: 'a', pressed: ['flurry'] }] });
  for (let frame = 1; frame < flurryStartup; frame++) sim.step();
  expect(sim.step({ inputs: [{ fighterId: 'b', guard: true }, { fighterId: 'a', pressed: ['heavy'] }] })[0]?.kind).toBe('parry');
  expect(sim.inspect().fighters[0]).toMatchObject({ moveId: '', stunKind: 'parry', stunFrames: 20, history: [] });
  expect(sim.inspect().fighters[1]).toMatchObject({ moveId: '', stunFrames: 0 });
  const events = [];
  for (let frame = 0; frame < 18; frame++) events.push(...sim.step({ inputs: [{ fighterId: 'a', pressed: ['jab'], drive: true }, { fighterId: 'b', pressed: frame === 0 ? ['jab'] : [] }] }));
  expect(events.some(event => event.kind === 'hit' && event.attackerId === 'b')).toBe(true);
  expect(events.some(event => event.attackerId === 'a')).toBe(false);
});

test('idle air stamina recovery is configurable and movement spending never also regenerates', () => {
  const config = { ...createTouchOfDeathPreset(), idleStaminaRegen: undefined, staminaRegen: .65, airStaminaRegen: .18 };
  for (const airborne of [false, true]) {
    const sim = createCombatSimulation({ config, fighters });
    const snapshot = sim.capture();snapshot.fighters[0]!.stamina = 20;sim.restore({ snapshot });
    sim.step({ inputs: [{ fighterId: 'a', airborne }] });
    expect(sim.inspect().fighters[0]!.stamina).toBeCloseTo(20 + (airborne ? .18 : .65));
    sim.step({ inputs: [{ fighterId: 'a', airborne, locomotionCost: 8 }] });
    expect(sim.inspect().fighters[0]!.stamina).toBeCloseTo(12 + (airborne ? .18 : .65));
  }
  for (const invalid of [-1, NaN, Infinity]) expect(() => readCombatConfig({ ...config, airStaminaRegen: invalid })).toThrow();
  expect(() => readCombatConfig({ ...config, parryRecoveryFrames: 1.5 })).toThrow();
  const legacy = createCombatSimulation({ config: { ...config, airStaminaRegen: undefined }, fighters });
  const saved = legacy.capture();saved.fighters[0]!.stamina = 0;legacy.restore({ snapshot: saved });
  legacy.step({ inputs: [{ fighterId: 'a', airborne: true }] });
  expect(legacy.inspect().fighters[0]!.stamina).toBe(.65);
});


test('rejected jump and step payments recover stamina without granting locomotion', () => {
  const config = { ...createTouchOfDeathPreset(), idleStaminaRegen: undefined, staminaRegen: .45, airStaminaRegen: .15 };
  for (const airborne of [false, true]) for (const cost of [12, 14]) {
    const sim = createCombatSimulation({ config, fighters });
    sim.step({ inputs: [{ fighterId: 'a', locomotionCost: 100 }], contacts: [] });
    sim.step({ inputs: [{ fighterId: 'a', airborne, locomotionCost: cost }], contacts: [] });
    expect(sim.inspect().fighters[0]!.locomotionAllowed).toBe(false);
    expect(sim.inspect().fighters[0]!.stamina).toBeCloseTo(airborne ? .15 : .45);
  }
});

test('hitstun alone regenerates defender stamina; caps, KO and confirmed parry refunds obey configured values', () => {
  const config={...createTouchOfDeathPreset(),idleStaminaRegen: undefined, staminaRegen:0,airStaminaRegen:0,hitstunStaminaRegen:.3,parryStaminaRestore:6};
  for(const kind of ['hit','block','parry'] as const) {
    const sim=createCombatSimulation({config,fighters});const saved=sim.capture();Object.assign(saved.fighters[1]!,{stamina:20,stunKind:kind,stunFrames:20});sim.restore({snapshot:saved});
    for(let i=0;i<10;i++)sim.step();expect(sim.inspect().fighters[1]!.stamina).toBeCloseTo(kind==='hit'?23:20);
  }
  for(const health of [0,100]) {
    const sim=createCombatSimulation({config,fighters});const saved=sim.capture();Object.assign(saved.fighters[1]!,{stamina:99.9,health,stunKind:'hit',stunFrames:20});sim.restore({snapshot:saved});sim.step();expect(sim.inspect().fighters[1]!.stamina).toBe(health?100:99.9);
  }
  for(const stamina of [20,99]) {
    const sim=createCombatSimulation({config,fighters});const saved=sim.capture();saved.fighters[1]!.stamina=stamina;sim.restore({snapshot:saved});
    sim.step({inputs:[{fighterId:'a',pressed:['jab']}]});
    for(let i=1;i<config.moves.find(move=>move.id==='jab')!.startupFrames;i++)sim.step();
    expect(sim.step({inputs:[{fighterId:'b',guard:true}]})[0]?.kind).toBe('parry');
    expect(sim.inspect().fighters[1]!.stamina).toBe(Math.min(100,stamina+6));
    sim.step({inputs:[{fighterId:'b',guard:true}]});expect(sim.inspect().fighters[1]!.stamina).toBe(Math.min(100,stamina+6));
  }
  for(const key of ['hitstunStaminaRegen','parryStaminaRestore'])for(const invalid of [-1,NaN,Infinity])expect(()=>readCombatConfig({...config,[key]:invalid})).toThrow();
});

test('fresh shield beats an older buffered attack at recovery without cancelling commitment', () => {
  const config=createTouchOfDeathPreset(), jab=config.moves.find(move=>move.id==='jab')!;
  const sim=createCombatSimulation({config,fighters});const saved=sim.capture();
  Object.assign(saved.fighters[1]!,{moveId:'jab',moveFrame:jab.startupFrames+jab.activeFrames+jab.recoveryFrames,history:[{key:'heavy',frame:0,direction:'neutral',side:1,drive:false,airborne:false}]});
  Object.assign(saved.fighters[0]!,{moveId:'jab',moveFrame:jab.startupFrames});sim.restore({snapshot:saved});
  expect(sim.step({inputs:[{fighterId:'b',guard:true}]})[0]?.kind).toBe('parry');
  const committed=createCombatSimulation({config,fighters}), state=committed.capture();Object.assign(state.fighters[1]!,{moveId:'heavy',moveFrame:1});committed.restore({snapshot:state});
  committed.step({inputs:[{fighterId:'b',guard:true}]});expect(committed.inspect().fighters[1]!.moveId).toBe('heavy');
});


test('legacy rules without defensive stamina fields retain zero hitstun recovery and parry refund', () => {
  const config={...createTouchOfDeathPreset(),idleStaminaRegen: undefined, staminaRegen:0,airStaminaRegen:0};
  delete config.hitstunStaminaRegen;delete config.parryStaminaRestore;
  const sim=createCombatSimulation({config,fighters});const saved=sim.capture();Object.assign(saved.fighters[1]!,{stamina:20,stunKind:'hit',stunFrames:3});sim.restore({snapshot:saved});
  for(let i=0;i<3;i++)sim.step();expect(sim.inspect().fighters[1]!.stamina).toBe(20);
  sim.step({inputs:[{fighterId:'a',pressed:['jab']}]});
  for(let i=1;i<config.moves.find(move=>move.id==='jab')!.startupFrames;i++)sim.step();
  expect(sim.step({inputs:[{fighterId:'b',guard:true}]})[0]?.kind).toBe('parry');
  expect(sim.inspect().fighters[1]!.stamina).toBe(20);
});
