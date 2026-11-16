import { cos, sin } from '../../../math/simulation.ts';
import type { CombatSnapshot } from '../../../combat/state.ts';
import type { Hyperfocus3DEvaluatedFrame } from '../../../frame/3d.ts';
import type { GameplayPresentation3D } from '../gameplay-contracts.ts';
import { createCombatIntroPose3D } from '../combat-visuals/intro-pose.ts';
import { presentCombatTitleCamera3D } from '../combat-visuals/camera.ts';
import { createAppearancePosePresenter3D } from '../appearance/pose.ts';
import type { ResolvedAppearancePose3D } from '../appearance/catalog.ts';
import { readCombatMatchSnapshot3D } from './snapshot.ts';
import { isRecord } from '@hyperfocus/utilities/records';

type Phase = 'menu' | 'intro' | 'countdown' | 'fighting' | 'practice' | 'round-result' | 'match-result';
type Winner = '' | 'player' | 'opponent' | 'draw';
export type CombatMatchSnapshot3D = { version: 1; phase: Phase; difficulty: number; ticks: number; playerWins: number; opponentWins: number; winner: Winner; held: string[]; introExit?: number; quick?: boolean; theater?: boolean; queueSeed?: number; matchIndex?: number; rematchVotes?: [boolean, boolean] };
const actions = ['pause', 'match:start', 'match:theater', 'match:first', 'match:quick', 'match:easier', 'match:harder', 'match:replay', 'match:next', 'match:learn-defense', 'match:menu', 'match:quit', 'match:practice', 'practice:reset'];
const phases: Phase[] = ['menu', 'intro', 'countdown', 'fighting', 'practice', 'round-result', 'match-result'];
const rematchActions = ['match:rematch:0', 'match:rematch:1'];
const roundResultTicks = 390; // 210 live post-KO ticks, then the existing 180-tick recovery.
const difficultyActions = Array.from({ length: 9 }, (_, index) => `match:difficulty:${index + 1}`);
actions.push(...difficultyActions);

/** A fixed-step, first-to-three local match. Hosts freeze combat whenever fighting is false. */
export function createCombatMatch3D(options: { difficulty?: number; queueSeed?: number; online?: boolean; mode?: 'set' | 'training' } = {}) {
  if (options.mode !== undefined && options.mode !== 'set' && options.mode !== 'training' || options.mode === 'training' && !options.online) throw new Error('Training requires an online match.');
  const training = options.mode === 'training';
  const difficulty = options.difficulty ?? 5;
  const queueSeed = options.queueSeed ?? 0x746f64;
  if (!Number.isInteger(queueSeed) || queueSeed < 0 || queueSeed > 4294967295) throw new Error('Combat queue seed must be an unsigned 32-bit integer.');
  if (!Number.isInteger(difficulty) || difficulty < 1 || difficulty > 9) throw new Error('AI difficulty must be an integer from 1 to 9.');
  // The saved sequence starts at the shared session seed; retries advance it.
  const initial = (): CombatMatchSnapshot3D => {
    const state: CombatMatchSnapshot3D = { version: 1, phase: options.online ? 'countdown' : 'menu', difficulty, ticks: options.online ? 180 : 0, playerWins: 0, opponentWins: 0, winner: '', held: [], introExit: 1, queueSeed, matchIndex: options.queueSeed ?? 0 };
    if (options.online) state.rematchVotes = [false, false];
    return state;
  };
  const startState = (): CombatMatchSnapshot3D => training ? { ...initial(), phase: 'practice', ticks: 0 } : initial();
  let memory = startState();
  function queue() { memory.queueSeed = (Math.imul(memory.queueSeed ?? 0x746f64, 1664525) + 1013904223) >>> 0;memory.quick = true;const roll = memory.queueSeed / 4294967296;memory.difficulty = roll < .05 ? 9 : 3 + Math.min(5, Math.floor((roll - .05) / .95 * 6)); }
  const cameraBases = new WeakMap<Hyperfocus3DEvaluatedFrame, Hyperfocus3DEvaluatedFrame['camera']>();
  const poseIntro = createCombatIntroPose3D();
  const poseVictory = createAppearancePosePresenter3D();
  const victoryActors = new WeakMap<Hyperfocus3DEvaluatedFrame, Set<string>>();
  const enter = (phase: Phase, ticks = 0) => { memory.phase = phase; memory.ticks = ticks; };
  function validate(value: unknown): asserts value is CombatMatchSnapshot3D {
    if (!isRecord(value)) throw new Error('Invalid combat match snapshot.');
    const record = value;
    const keys = Object.keys(initial()).filter(key => key !== 'introExit' && key !== 'queueSeed' && key !== 'matchIndex');
    if (Object.keys(record).some(key => !['introExit', 'quick', 'theater', 'queueSeed', 'matchIndex'].includes(key) && !keys.includes(key)) || keys.some(key => !(key in record)) || record.version !== 1 || !phases.some(phase => phase === record.phase)) throw new Error('Invalid combat match snapshot.');
    if (record.theater !== undefined && (typeof record.theater !== 'boolean' || record.theater && (options.online || record.difficulty !== 9 || record.phase === 'practice'))) throw Error('Invalid theater state.');
    if (record.quick !== undefined && typeof record.quick !== 'boolean' || record.queueSeed !== undefined && (typeof record.queueSeed !== 'number' || !Number.isInteger(record.queueSeed) || record.queueSeed < 0 || record.queueSeed > 4294967295)) throw new Error('Invalid quickmatch state.');
    if (record.introExit !== undefined && (typeof record.introExit !== 'number' || !Number.isFinite(record.introExit) || record.introExit < 0 || record.introExit > 1)) throw new Error('Invalid combat intro camera progress.');
    if (typeof record.difficulty !== 'number' || !Number.isInteger(record.difficulty) || record.difficulty < 1 || record.difficulty > 9) throw new Error('Invalid combat match difficulty.');
    if (typeof record.ticks !== 'number' || !Number.isInteger(record.ticks) || record.ticks < 0 || record.ticks > roundResultTicks) throw new Error('Invalid combat match ticks.');
    if (typeof record.playerWins !== 'number' || !Number.isInteger(record.playerWins) || record.playerWins < 0 || record.playerWins > 3) throw new Error('Invalid combat match playerWins.');
    if (typeof record.opponentWins !== 'number' || !Number.isInteger(record.opponentWins) || record.opponentWins < 0 || record.opponentWins > 3) throw new Error('Invalid combat match opponentWins.');
    if (record.matchIndex !== undefined && (typeof record.matchIndex !== 'number' || !Number.isInteger(record.matchIndex) || record.matchIndex < 0 || record.matchIndex > 4294967295)) throw new Error('Invalid match starting location counter.');
    const acceptedActions = options.online ? rematchActions : actions;
    if (typeof record.winner !== 'string' || !['', 'player', 'opponent', 'draw'].includes(record.winner) || !Array.isArray(record.held) || record.held.length > acceptedActions.length || record.held.some(item => typeof item !== 'string' || !acceptedActions.includes(item)) || new Set(record.held).size !== record.held.length) throw new Error('Invalid combat match input or winner.');
    if (options.online && (!(training ? ['practice'] : ['countdown', 'fighting', 'round-result', 'match-result']).includes(String(record.phase)) || !Array.isArray(record.rematchVotes) || record.rematchVotes.length !== 2 || record.rematchVotes.some(vote => typeof vote !== 'boolean') || record.phase !== 'match-result' && record.rematchVotes.some(Boolean))) throw new Error('Invalid online combat match state.');
    if (training && (record.playerWins !== 0 || record.opponentWins !== 0 || record.held.length)) throw new Error('Invalid training match state.');
    const timed = record.phase === 'intro' ? 240 : record.phase === 'countdown' ? 180 : record.phase === 'round-result' ? roundResultTicks : 0;
    if (record.ticks > timed || (timed > 0 && record.ticks === 0) || (record.playerWins === 3 && record.opponentWins === 3)) throw new Error('Invalid combat match phase timer.');
    const ended = record.playerWins === 3 || record.opponentWins === 3;
    if ((record.phase === 'match-result') !== ended || (record.phase === 'menu' && (record.playerWins !== 0 || record.opponentWins !== 0))) throw new Error('Invalid combat match score.');
    const result = record.phase === 'round-result' || record.phase === 'match-result';
    if (result === (record.winner === '') || (ended && record.winner !== (record.playerWins === 3 ? 'player' : 'opponent'))) throw new Error('Invalid combat match winner.');
    readCombatMatchSnapshot3D(value);
  }
  return {
    get phase() { return memory.phase; },
    get postKnockout() { return memory.phase === 'round-result' && memory.ticks > 180; },
    get terminalRound() { return memory.phase === 'round-result' && (memory.winner === 'player' && memory.playerWins === 2 || memory.winner === 'opponent' && memory.opponentWins === 2); },
    get difficulty() { return memory.difficulty; }, get theater() { return memory.theater === true; },
    get handlesStart() { return memory.phase !== 'fighting' && memory.phase !== 'round-result' && memory.phase !== 'practice'; },
    reset() { memory = startState(); },
    capture(): CombatMatchSnapshot3D { const saved = structuredClone(memory);if (saved.quick === undefined) delete saved.quick;if (saved.queueSeed === undefined) delete saved.queueSeed;return saved; },
    validate(value: unknown) { validate(value); },
    restore(value: unknown) { validate(value); memory = { ...structuredClone(value), introExit: value.introExit ?? 1 }; },
    step(input: { actions: ReadonlySet<string>; state: CombatSnapshot; playerId: string; opponentId: string }) {
      if (training) return { resetRound: false, recoverRound: false, fighting: true, consumedStart: false };
      if (options.online) input = { ...input, actions: new Set([...input.actions].filter(action => rematchActions.includes(action))) };
      const pressed = (action: string) => input.actions.has(action) && !memory.held.includes(action);
      const start = pressed('match:start') || pressed('pause');
      const consumedStart = memory.phase !== 'fighting' && memory.phase !== 'practice' && start;
      let resetRound = false, recoverRound = false;
      if (options.online && memory.phase === 'match-result') {
        for (const [seat, action] of rematchActions.entries()) if (pressed(action)) memory.rematchVotes![seat] = true;
        if (memory.rematchVotes!.every(Boolean)) { memory = { ...initial(), matchIndex: ((memory.matchIndex ?? 0) + 1) >>> 0 };resetRound = true; }
      } else if (pressed('match:quit')) {
        memory = { ...initial(), difficulty: memory.difficulty, queueSeed: memory.queueSeed, matchIndex: ((memory.matchIndex ?? 0) + Number(memory.phase !== 'menu' && memory.phase !== 'practice')) >>> 0 };resetRound = true;
      } else if ((pressed('match:practice') || pressed('match:learn-defense')) && (memory.phase === 'menu' || memory.phase === 'match-result')) {
        memory = { ...initial(), difficulty: memory.difficulty, queueSeed: memory.queueSeed, matchIndex: ((memory.matchIndex ?? 0) + Number(memory.phase === 'match-result')) >>> 0, phase: 'practice' }; resetRound = true;
      } else if (memory.phase === 'practice') {
        if (pressed('match:menu')) { memory = { ...initial(), difficulty: memory.difficulty, queueSeed: memory.queueSeed, matchIndex: memory.matchIndex ?? 0 }; resetRound = true; }
        else if (pressed('practice:reset')) resetRound = true;
      } else if (memory.phase === 'menu') {
        const selectedDifficulty = difficultyActions.findIndex(pressed);
        if (selectedDifficulty >= 0) memory.difficulty = selectedDifficulty + 1;
        memory.difficulty = Math.max(1, Math.min(9, memory.difficulty + Number(pressed('match:harder')) - Number(pressed('match:easier'))));
        if (pressed('match:theater')) { memory.theater = true;memory.difficulty = 9;memory.quick = false;enter('intro', 240);resetRound = true; }
        else if (pressed('match:first')) { memory.difficulty = 1;memory.quick = false;enter('intro', 240);resetRound = true; }
        else if (pressed('match:quick')) { queue();enter('intro', 240);resetRound = true; }
        else if (start) { memory.quick = false;enter('intro', 240); resetRound = true; }
      } else if (memory.phase === 'intro') {
        if (start || --memory.ticks === 0) { memory.introExit = (240 - memory.ticks) / 240; enter('countdown', 180); }
      } else if (memory.phase === 'countdown') {
        if (--memory.ticks === 0) enter('fighting');
      } else if (memory.phase === 'fighting') {
        const player = input.state.fighters.find(item => item.id === input.playerId);
        const opponent = input.state.fighters.find(item => item.id === input.opponentId);
        if (player && opponent && (player.health <= 0 || opponent.health <= 0)) {
          memory.winner = player.health <= 0 ? opponent.health <= 0 ? 'draw' : 'opponent' : 'player';
          enter('round-result', roundResultTicks);
        }
      } else if (memory.phase === 'round-result') {
        if (--memory.ticks === 0) {
          if (memory.winner === 'player') memory.playerWins++;
          if (memory.winner === 'opponent') memory.opponentWins++;
          if (memory.playerWins === 3 || memory.opponentWins === 3) enter('match-result');
          else { enter('fighting'); recoverRound = true; memory.winner = ''; memory.introExit = 1; }
        }
      } else if (pressed('match:menu')) {
        memory = { ...initial(), difficulty: memory.difficulty, queueSeed: memory.queueSeed, matchIndex: ((memory.matchIndex ?? 0) + Number(memory.phase === 'match-result')) >>> 0 }; resetRound = true;
      } else if (pressed('match:replay') || pressed('match:next') || start) {
        memory = { ...initial(), difficulty: memory.difficulty, quick: memory.quick, ...(memory.theater ? { theater: true } : {}), queueSeed: memory.queueSeed, matchIndex: ((memory.matchIndex ?? 0) + 1) >>> 0, phase: 'intro', ticks: 240 };if (pressed('match:next') && !memory.theater) queue();resetRound = true;
      }
      memory.held = (options.online ? rematchActions : actions).filter(action => input.actions.has(action));
      return { resetRound, recoverRound, fighting: memory.phase === 'fighting' || memory.phase === 'round-result' || memory.phase === 'practice', consumedStart };
    },
    presentation(base: GameplayPresentation3D): GameplayPresentation3D {
      const score = `${memory.playerWins} - ${memory.opponentWins}`;
      if (memory.phase === 'fighting' || memory.phase === 'round-result' || memory.phase === 'practice') return { ...base, layout: 'fight', objective: score, metrics: undefined, status: undefined, hint: '', overlay: undefined, actions: base.actions?.filter(action => !action.action.endsWith(':reset')) };
      let title = '', body = '', controls: NonNullable<GameplayPresentation3D['actions']> = [];
      if (memory.phase === 'menu') {
        title = 'Touch of Death'; body = `AI difficulty ${memory.difficulty} / 9\nStart match uses this level. First fight starts at level 1; Practice teaches movement and defense.`;
        controls = [{ action: 'match:start', label: 'Start match' }, { action: 'match:first', label: 'First fight · AI level 1' }, { action: 'match:practice', label: 'Learn in Practice' }, { action: 'match:theater', label: 'Theater - AI 9 vs AI 9' }, { action: 'match:difficulty', label: 'AI difficulty', range: { min: 1, max: 9, value: memory.difficulty } }, { action: 'match:quick', label: 'Random AI · levels 3–9' }];
      } else if (memory.phase === 'intro') {
        title = 'Touch of Death'; body = ''; controls = [{ action: 'match:start', label: 'Skip intro · Start' }];
      } else if (memory.phase === 'countdown') {
        title = String(Math.ceil(memory.ticks / 60)); body = '';
      } else {
        title = options.online || memory.theater ? memory.playerWins === 3 ? 'Fighter 1 wins' : 'Fighter 2 wins' : memory.playerWins === 3 ? 'You win' : 'AI wins'; body = options.online ? score : memory.theater ? `${score}\nTheater · AI 9 vs AI 9` : `${score}\nLocal AI · Level ${memory.difficulty} / 9`;
        controls = memory.theater ? [{ action: 'match:replay', label: 'Retry theater' }, { action: 'match:menu', label: 'Main menu' }] : options.online ? [] : [{ action: 'match:replay', label: 'Rematch · same AI' }, ...(memory.quick ? [{ action: 'match:next', label: 'Next opponent' }] : []), ...(memory.opponentWins === 3 ? [{ action: 'match:learn-defense', label: 'Practice defending' }] : []), { action: 'match:menu', label: 'Main menu' }, { action: 'match:practice', label: 'Practice' }];
      }
      const layout = memory.phase === 'menu' || memory.phase === 'intro' || memory.phase === 'countdown' ? memory.phase : 'result';
      return { ...base, layout, objective: score, status: title, hint: '', overlay: { title, body }, actions: controls };
    },
    presentFrame(input: { frame: Hyperfocus3DEvaluatedFrame; state: CombatSnapshot; poses?: readonly ResolvedAppearancePose3D[]; playerId?: string; opponentId?: string; viewportAspect?: number; victoryOverlay?: boolean }) {
      const previousVictory = victoryActors.get(input.frame);
      if (previousVictory) {
        for (const actorId of previousVictory) poseVictory({ frame: input.frame, actorId, style: 'default', progress: 0, settle: 0 });
        previousVictory.clear();
      }
      const cinematic = memory.phase === 'intro' || memory.phase === 'countdown';
      const cached = cameraBases.get(input.frame);
      if (!cinematic) {
        if (cached) { input.frame.camera = structuredClone(cached); poseIntro({ ...input, progress: 0, settle: 0 }); }
        if (memory.phase === 'menu') presentCombatTitleCamera3D(input);
        for (const fighter of input.state.fighters) {
          const selected = input.poses?.find(pose => pose.actorId === fighter.id && pose.phase === 'victory');
          if (!selected || selected.style === 'default') continue;
          const winner = memory.phase === 'match-result' && (memory.winner === 'player' ? fighter.id === (input.playerId ?? input.state.fighters[0]?.id) : memory.winner === 'opponent' ? fighter.id === (input.opponentId ?? input.state.fighters[1]?.id) : false);
          if (winner && input.victoryOverlay !== false) {
            const actors = previousVictory ?? new Set<string>();victoryActors.set(input.frame, actors);actors.add(fighter.id);
            poseVictory({ frame: input.frame, actorId: fighter.id, style: selected.style, progress: 1, settle: 1 });
          }
        }
        return;
      }
      // The live camera already fits both silhouettes to this viewport. A modest
      // outward orbit retains that composition instead of cutting to a fixed shot.
      const base = cached ?? structuredClone(input.frame.camera);
      if (!cached) cameraBases.set(input.frame, base);
      const progress = memory.phase === 'intro' ? (240 - memory.ticks) / 240 : memory.introExit ?? 1;
      const ease = progress * progress * (3 - 2 * progress);
      const countdown = memory.phase === 'countdown' ? (180 - memory.ticks) / 180 : 0;
      const settle = 1 - countdown * countdown * (3 - 2 * countdown);
      poseIntro({ ...input, progress, settle });
      const yaw = (-.32 + .44 * ease) * settle, distance = 1 + (.3 - .18 * ease) * settle;
      const x = base.position[0] - base.target[0], y = base.position[1] - base.target[1], z = base.position[2] - base.target[2];
      input.frame.camera.target = [...base.target];
      input.frame.camera.position = [base.target[0] + (x * cos(yaw) + z * sin(yaw)) * distance,
        base.target[1] + y * distance, base.target[2] + (z * cos(yaw) - x * sin(yaw)) * distance];
    },
  };
}
