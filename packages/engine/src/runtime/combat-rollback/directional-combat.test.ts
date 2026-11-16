import { expect, test } from 'bun:test';
import { createCombatSimulation } from '../../combat/simulation.ts';
import { createTouchOfDeathPreset } from '../../combat/touch-of-death.ts';
import type { CombatInput, CombatEvent } from '../../combat/state.ts';
import { createRollbackParticipant } from './checkpoint.ts';
import { createCombatRollbackSession } from './session.ts';

test('opposite local peers converge after asymmetric delayed input and deliver the same combat contacts', () => {
  const input = (id: string, frame: number): Omit<CombatInput, 'fighterId'> => ({
    pressed: frame === 0 ? [id === 'a' ? 'heavy' : 'jab'] : [],
    direction: { x: id === 'a' ? 1 : -1, y: 0, z: frame > 20 ? .5 : 0 },
  });
  function client(localPeerId: string) {
    const combat = createCombatSimulation({ config: createTouchOfDeathPreset(), fighters: [
      { id: 'a', position: { x: 0, y: 0, z: 0 } },
      { id: 'b', position: { x: 1, y: 0, z: 0 }, facing: { x: -1, y: 0, z: 0 } },
    ] });
    const events: CombatEvent[] = [];
    let frame = 0;
    const session = createCombatRollbackSession<Omit<CombatInput, 'fighterId'>, CombatEvent>({
      peerIds: ['a', 'b'], localPeerId, defaultInput: {},
      getLocalInput: () => input(localPeerId, frame++),
      participants: [createRollbackParticipant({ id: 'combat', capture: combat.capture, restore: snapshot => combat.restore({ snapshot }) })],
      update({ inputs, emit }) {
        // Roster order and fighter identity belong to the session, not the sender.
        for (const event of combat.step({ inputs: ['a', 'b'].map(fighterId => ({ ...inputs[fighterId], fighterId })) })) emit(event.id, event);
      },
      onConfirmedEvent: ({ event }) => events.push(event),
    });
    return { combat, session, events };
  }
  const a = client('a'), b = client('b');
  for (let frame = 0; frame < 45; frame++) {
    a.session.tick(); b.session.tick();
    if (frame >= 3) a.session.receiveInput('b', frame - 3, input('b', frame - 3));
    if (frame >= 7) b.session.receiveInput('a', frame - 7, input('a', frame - 7));
  }
  expect(a.session.confirmedFrame()).toBe(41);
  expect(b.session.confirmedFrame()).toBe(37);
  for (let frame = 44; frame >= 0; frame--) {
    a.session.receiveInput('b', frame, input('b', frame));
    b.session.receiveInput('a', frame, input('a', frame));
  }
  expect(a.combat.capture()).toEqual(b.combat.capture());
  expect(a.session.stateHash(44)).toBe(b.session.stateHash(44));
  expect(a.events.length).toBeGreaterThan(0);
  expect(a.events).toEqual(b.events);
  expect(a.combat.capture().fighters.some(fighter => fighter.health < 100)).toBe(true);
  const before = a.combat.capture();
  a.session.receiveInput('intruder', 45, { pressed: ['heavy'] });
  a.session.receiveInput('b', 0, { pressed: ['escape'] });
  expect(a.combat.capture()).toEqual(before);
});

test('late directional and Drive input reproduces stamina, strings, influence and confirmed impulses', () => {
  function fixture() {
    const combat = createCombatSimulation({ config: createTouchOfDeathPreset(), fighters: [
      { id: 'local', position: { x: 0, y: 0, z: 0 } },
      { id: 'remote', position: { x: 1, y: 0, z: 0 }, facing: { x: -1, y: 0, z: 0 } },
    ] });
    const events: CombatEvent[] = [];
    let localFrame = 0;
    const session = createCombatRollbackSession<CombatInput, CombatEvent>({
      peerIds: ['local', 'remote'], localPeerId: 'local', defaultInput: { fighterId: 'remote' },
      getLocalInput: () => ({ fighterId: 'local', pressed: localFrame++ === 0 ? ['heavy'] : [], direction: { x: 0, y: 0, z: 1 } }),
      participants: [createRollbackParticipant({ id: 'combat', capture: combat.capture, restore: snapshot => combat.restore({ snapshot }) })],
      update({ inputs, emit }) { for (const event of combat.step({ inputs: [inputs.local, inputs.remote] })) emit(event.id, event); },
      onConfirmedEvent: ({ event }) => events.push(event),
    });
    return { combat, session, events };
  }
  const timely = fixture(), delayed = fixture();
  const input = (frame: number): CombatInput => ({ fighterId: 'remote',
    pressed: frame === 0 || frame === 14 ? ['jab'] : [], drive: frame === 0,
    direction: frame < 20 ? { x: -1, y: 0, z: 0 } : { x: 0, y: 0, z: -1 },
  });
  for (let frame = 0; frame < 45; frame++) {
    timely.session.receiveInput('remote', frame, input(frame));
    timely.session.tick(); delayed.session.tick();
  }
  for (let frame = 44; frame >= 0; frame--) delayed.session.receiveInput('remote', frame, input(frame));
  expect(delayed.combat.capture()).toEqual(timely.combat.capture());
  expect(delayed.session.stateHash(44)).toBe(timely.session.stateHash(44));
  expect(delayed.events).toEqual(timely.events);
  expect(delayed.events.length).toBeGreaterThan(0);
});
