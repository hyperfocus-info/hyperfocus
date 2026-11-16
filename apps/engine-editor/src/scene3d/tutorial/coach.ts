import type { CombatProject3D, createGameplay3D, GameplaySnapshot3D } from '@hyperfocus/engine/project/runtime-3d';
import { createTutorialCoach, createTutorialSession } from '@hyperfocus/ui/tutorial';
import { tutorialDefinition } from './lessons';
import { createTutorialEvidence } from './evidence';
import { createTutorialDemonstration } from './demonstration';
import type { createGuidedFight } from './guided-fight';
import { combatBindingLabel, combatActionLabel } from '../fight-hud/control-hint';
import { createTutorialRetry } from './retry';
import { createTutorialCelebration } from './celebration';
import type { TutorialLessonRewardResult } from '../rewards/standalone';

const lessonSequence = ['combo-lesson', 'parry-drill', 'tech-drill', 'di-drill', 'arena-lesson'];

/** Real guide + independent Practice consumers of the shared tutorial composition. */
export function createCombatTutorial(options: {
  canvas: HTMLCanvasElement; game: ReturnType<typeof createGameplay3D>; definition: CombatProject3D;
  mappings: readonly { action: string; bindings: readonly string[] }[]; guide?: ReturnType<typeof createGuidedFight>;
  clear(): void; resume(): void;
  requireWorld?(): void;
  awardLesson?(lessonId: string): Promise<TutorialLessonRewardResult>;
  recordMastery?(lessonId: string): Promise<string>;
}) {
  const host = options.canvas.parentElement!;
  const demo = createTutorialDemonstration(options);
  let kind = '', session: ReturnType<typeof createTutorialSession> | undefined, evidence = createTutorialEvidence(), watchEvidence = createTutorialEvidence();
  let lastTime: number | undefined, halfTick = false, celebrated = false, choiceShown = false, reward = '', rewardGeneration = 0;
  const retry = createTutorialRetry();
  const restart = () => { session?.retry();evidence = createTutorialEvidence();lastTime = undefined;retry.reset();celebrated = choiceShown = false;reward = '';rewardGeneration++;celebration.clear(); };
  const returnToPlay = () => { options.requireWorld?.();demo.close();view.close();options.clear();options.canvas.focus({ preventScroll: true }); };
  let hints = true;try { hints = localStorage.getItem('tod-tutorial-button-hints') !== 'off'; } catch { /* Session hints still work. */ }
  const view = createTutorialCoach({ parent: host,
    hints, hintsChanged(visible) { try { localStorage.setItem('tod-tutorial-button-hints', visible ? 'on' : 'off'); } catch { /* Session preference remains active. */ }options.clear();if (!view.expanded) options.canvas.focus({ preventScroll: true }); },
    watch() { options.requireWorld?.(); if (demo.state.active) { if (demo.state.done) { watchEvidence = createTutorialEvidence();demo.replay(); }else demo.toggle(); } else { watchEvidence = createTutorialEvidence();demo.open(kind);view.open(); }options.clear(); },
    retry() { options.requireWorld?.(); if (demo.state.active) { watchEvidence = createTutorialEvidence();demo.replay(); }else { if (options.guide?.state.active) options.guide.handle(new Set(['guide:retry']));else options.game.step(['practice:reset']);restart();returnToPlay(); }options.clear(); },
    back: returnToPlay,
    next() { options.requireWorld?.(); if (options.guide?.state.active) options.guide.handle(new Set(['guide:next']));else { options.game.step([`practice:${lessonSequence[lessonSequence.indexOf(kind) + 1] ?? 'neutral'}`]);options.game.step([]); }returnToPlay(); },
  });
  const details = document.createElement('button');details.type = 'button';details.textContent = 'Lesson details';details.dataset.tutorialDetails = '';details.onclick = () => { view.open();options.clear(); };view.element.querySelector('footer')!.append(details);
  const celebration = createTutorialCelebration(view.element);
  const open = document.createElement('button');open.type = 'button';open.dataset.tutorialOpen = '';open.textContent = 'Tutorial controls';open.hidden = true;host.append(open);
  open.onclick = () => { options.requireWorld?.(); options.resume();view.open();options.clear(); };
  const style = document.createElement('style');style.textContent = `
    .hf-fight-stage>.hf-tutorial{position:absolute;z-index:7;left:max(1.5rem,env(safe-area-inset-left));top:max(1.5rem,env(safe-area-inset-top));max-height:calc(100% - 5rem);--tutorial-surface:#101612f5;--tutorial-ink:var(--game-ink,#101612);--tutorial-text:var(--game-text,#eee9dc);--tutorial-muted:var(--game-muted,#bec6b9);--tutorial-accent:var(--game-accent,#e7aa63);--tutorial-focus:var(--game-focus,#82e5ef);--tutorial-line:#526054}
    .hf-fight-stage>[data-tutorial-open]{display:none}.hf-fight-stage:has(>.hf-tutorial:not([hidden])) .hf-practice-lesson,.hf-fight-stage:has(>.hf-tutorial:not([hidden])) .hf-guided-spotlight{display:none}
    .hf-fight-stage>.hf-tutorial[data-expanded=true]{z-index:12;width:min(32rem,calc(100% - 3rem))}.hf-fight-stage>.hf-tutorial[data-expanded=true][data-watching=false]{box-shadow:0 0 0 100vmax #080e0bbd}
    .hf-fight-stage>.hf-tutorial button{color:var(--game-text,#eee9dc);font:600 1rem/1.35 Arial,sans-serif;border-radius:0}.hf-fight-stage>.hf-tutorial button:first-child,.hf-fight-stage>.hf-tutorial [data-primary=true]{color:var(--game-ink,#101612);background:var(--game-text,#eee9dc)}
    .hf-fight-stage>.hf-tutorial footer{justify-content:flex-start}
    .hf-fight-stage>.hf-tutorial h2{font-size:1rem;color:var(--game-muted,#bec6b9);line-height:1.3}.hf-fight-stage>.hf-tutorial [data-tutorial-current] h3{font-size:clamp(1.35rem,2vw,1.8rem);line-height:1.15;font-weight:800}.hf-fight-stage>.hf-tutorial [data-tutorial-current]{border-left:4px solid var(--game-accent,#e7aa63);padding-left:1rem}
    .hf-fight-stage>.hf-tutorial[data-complete=true] [data-tutorial-current]{border-color:var(--game-focus,#82e5ef)}.hf-fight-stage>.hf-tutorial[data-complete=true] [data-tutorial-next]{background:var(--game-text,#eee9dc);color:var(--game-ink,#101612)}
    .hf-fight-stage>.hf-tutorial [data-tutorial-timing][data-window=open] strong{display:block;background:#eee9dc;color:#101612;padding:.5rem}.hf-fight-stage>.hf-tutorial [data-tutorial-timing][data-window=waiting] strong{color:#e7c563}.hf-fight-stage>.hf-tutorial [data-tutorial-timing][data-window=closed] strong{color:#f08b7d}
    .hf-fight-stage>.hf-tutorial:not([data-expanded=true]){width:min(20rem,calc(100% - 3rem));padding:1rem}
    .hf-fight-stage>.hf-tutorial:not([data-expanded=true]):not([data-complete=true]) :is(header h2,[data-tutorial-objective],ol,[data-tutorial-when],[data-tutorial-success]){display:none}
    .hf-fight-stage>.hf-tutorial:not([data-expanded=true]) :is([data-tutorial-current],[data-tutorial-timing],[data-tutorial-feedback],footer){margin-top:.5rem}
    .hf-fight-stage>.hf-tutorial:not([data-expanded=true]) [data-tutorial-current] h3{font-size:1.3rem}
    .hf-fight-stage>.hf-tutorial[data-watching=true]{width:min(22rem,calc(100% - 3rem))}
    .hf-fight-stage>.hf-tutorial[data-watching=true] :is(header h2,[data-tutorial-objective],ol,[data-tutorial-success]){display:none}
    @media(max-width:800px){.hf-fight-stage>.hf-tutorial{top:auto;bottom:max(3.5rem,env(safe-area-inset-bottom));left:max(.75rem,env(safe-area-inset-left));width:calc(100% - max(.75rem,env(safe-area-inset-left)) - max(.75rem,env(safe-area-inset-right)));max-height:46%;padding:1rem}.hf-tutorial:not([data-expanded=true]) header>p:last-child,.hf-tutorial:not([data-expanded=true]) [data-tutorial-success]{display:none}.hf-tutorial:not([data-expanded=true]) ol{margin:.75rem 0}.hf-fight-stage>.hf-tutorial[data-expanded=true]{max-height:calc(100% - 5rem)}}
    @media(max-width:800px){.hf-fight-stage>.hf-tutorial[data-watching=true]{max-height:38%}.hf-tutorial[data-watching=true] :is(header h2,[data-tutorial-objective],ol,[data-tutorial-when],[data-tutorial-success]){display:none}.hf-tutorial[data-watching=true] :is([data-tutorial-timing],[data-tutorial-feedback],footer){margin-top:.5rem}}
    @media(max-height:500px) and (min-width:801px){.hf-fight-stage>.hf-tutorial{width:22rem;max-height:calc(100% - 4rem);padding:1rem}}
    @media(max-height:500px){.hf-fight-stage>.hf-tutorial:not([data-expanded=true]) header,.hf-fight-stage>.hf-tutorial:not([data-expanded=true]) ol{display:none}.hf-fight-stage>.hf-tutorial:not([data-expanded=true]) [data-tutorial-current] h3{font-size:1.25rem}}
  `;host.append(style);
  function definition(snapshot: GameplaySnapshot3D, controller: boolean) {
    const prompt = options.guide?.prompt();
    const mapped: Record<string, string> = { opening: 'combo-lesson', defense: 'di-drill', arena: 'arena-lesson' };
    const next = prompt ? mapped[prompt.phase] ?? prompt.phase : snapshot.combat?.match?.phase === 'practice' ? snapshot.combat.practice.preset : '';
    const authored = tutorialDefinition({ kind: next ?? '', definition: options.definition, mappings: options.mappings, controller, branch: snapshot.combat?.practice.lesson?.branch });
    if (authored) return authored;
    if (prompt) return { id: prompt.phase, title: prompt.title, objective: prompt.phase === 'review' ? 'Watch the exchange, then retry one decision.' : 'Finish the set using what you have learned.',
      steps: [{ id: 'finish', label: 'Try it', instruction: prompt.phase === 'review' ? 'Retry the final exchange' : 'Play the set', input: 'Use your current combat bindings. Pause opens controls.', timing: 'Take your time. The result advances automatically.', success: prompt.phase === 'review' ? 'Return after a live retry of the recorded exchange.' : 'Reach the actual match result.' }], completion: 'Phase complete' };
  }
  return {
    get state() { return { kind, ...session?.state, hints: view.hintsVisible, retryPending: retry.pending, reward, demonstration: demo.state }; },
    get active() { return !view.element.hidden; },
    get focused() { return !view.element.hidden && view.focused; },
    get watching() { return demo.state.active; },
    step() { halfTick = !halfTick;if (halfTick) demo.step(); },
    reset: restart,
    render(input: { snapshot: GameplaySnapshot3D; now: number; controller: boolean; hidden: boolean; reducedMotion?: boolean }) {
      details.hidden = view.expanded || !!input.hidden;
      view.element.dataset.reducedMotion = String(!!input.reducedMotion);
      const authored = definition(input.snapshot, input.controller), deltaMs = lastTime === undefined ? 0 : input.now - lastTime;lastTime = input.now;
      open.hidden = !authored;
      if (!authored || input.hidden) { view.element.hidden = true;if (!demo.state.active) view.close();if (!authored) { kind = '';session = undefined;evidence = createTutorialEvidence();retry.reset();celebration.clear();rewardGeneration++;view.close(); }return; }
      if (kind !== authored.id || !session) { kind = authored.id;session = createTutorialSession({ definition: authored });evidence = createTutorialEvidence();retry.reset();celebration.clear();celebrated = choiceShown = false;reward = '';rewardGeneration++; }
      const sample = (demo.state.active ? watchEvidence : evidence).observe({ snapshot: input.snapshot, definition: options.definition, kind });
      const suspended = document.hidden || demo.state.active || view.expanded;
      if (sample.dropped && !demo.state.active && !session.state.complete) session.retry();
      const completed = authored.steps[0]?.id === 'finish' ? options.guide?.state.observed ? ['finish'] : [] : sample.completed;
      session.observe({ attempt: session.state.attempt, completed, feedback: sample.feedback, deltaMs, source: demo.state.active ? 'demonstration' : 'player', suspended });
      if (retry.observe({ failed: !demo.state.active && sample.failed, recovered: !demo.state.active && sample.recovered, complete: session.state.complete, suspended, deltaMs })) {
        options.requireWorld?.();
        if (options.guide?.state.active) options.guide.handle(new Set(['guide:retry']));
        else { options.game.step(['practice:reset']);options.game.step([]); }
        restart();options.clear();return;
      }
      if (!suspended) celebration.tick(deltaMs);
      if (session.state.complete && !celebrated && !demo.state.active) {
        celebrated = true;celebration.play();
        if (options.awardLesson && authored.steps[0]?.id !== 'finish') {
          const generation = ++rewardGeneration;reward = 'Saving lesson reward…';
          void Promise.all([options.awardLesson(kind), options.recordMastery?.(kind) ?? Promise.resolve('')]).then(([result, mastery]) => {
            if (generation !== rewardGeneration) return;
            reward = result.saved ? result.firstClear ? `+${result.coins} coins · ${result.balance} total` : 'Lesson mastered · first-clear coins already earned' : result.error || 'Reward could not be saved. Open Rewards to retry.';
          if (mastery) reward += ` ${mastery}`;
          }).catch(() => { if (generation === rewardGeneration) reward = 'Reward could not be saved. Open Rewards to retry.'; });
        }
      }
      const canWatch = ['combo-lesson', 'movement', 'first-hit', 'guard', 'parry-drill', 'tech-drill', 'di-drill', 'arena-lesson'].includes(kind);
      const state = session.state, demonstration = demo.state;
      const exampleInput = demonstration.lastInput;
      const inputLabels = exampleInput?.actions.map(action => {
        const binding = options.mappings.find(mapping => mapping.action === action)?.bindings.find(binding => binding.startsWith('Gamepad') === input.controller);
        return `${binding ? combatBindingLabel(binding) : 'unbound'} (${combatActionLabel(action)})`;
      });
      const prefix = options.definition.fighters.find(fighter => fighter.control === 'player')?.actionPrefix ?? '';
      const timingLabels = sample.timingActions.flatMap(action => {
        const binding = options.mappings.find(mapping => mapping.action === prefix + action)?.bindings.find(binding => binding.startsWith('Gamepad') === input.controller);
        return binding ? [combatBindingLabel(binding)] : [];
      });
      view.render({ definition: authored, completed: demonstration.active ? completed : state.completed, complete: !demonstration.active && state.complete,
        feedback: demonstration.done ? { id: 'example-result', message: demonstration.successful ? kind === 'arena-lesson' ? 'Pickup, use and throw demonstrated' : 'Example complete' : 'This example did not complete', correction: demonstration.successful ? kind === 'arena-lesson' ? 'Try these three steps, then hit a cracked panel or wooden prop with Heavy until it breaks. This example does not complete your lesson.' : 'Return to your attempt and try the same sequence. Your progress is unchanged.' : 'Replay the example or return to your attempt. No success was awarded.' } : demonstration.active ? undefined : state.feedback,
        timing: sample.timing && { ...sample.timing, cue: [...new Set(timingLabels), sample.timing.cue].join(' · ') }, watching: demonstration.active, paused: demonstration.paused, watchFinished: demonstration.done, playbackLabel: '½ speed', returnLabel: 'Back to practice',
        reward: demonstration.active ? undefined : reward, automaticRetry: true, completionChoices: !options.guide?.state.active && !demonstration.active, watchLabel: kind === 'combo-lesson' ? 'Watch AI combo' : 'Watch AI example', retryLabel: 'Practice again',
        continueLabel: options.guide?.state.active ? 'Next phase' : lessonSequence.indexOf(kind) === lessonSequence.length - 1 ? 'Free practice' : 'Next lesson',
        demonstrationInput: exampleInput ? `Last input · ${exampleInput.direction} + ${inputLabels?.join(' + ')} · frame ${exampleInput.frame}` : kind === 'di-drill' ? 'Watch the sideways steering during impact.' : 'Watch the approach; the first input will appear here.',
        ...(canWatch ? {} : { demonstration: { unavailable: kind === 'arena-lesson' ? 'Use the highlighted tool and the live steps. This arena has no recorded tool demonstration.' : 'Use the live match or exchange review for this phase.' } }),
        nextLabel: options.guide?.state.active ? 'Next phase starts automatically.' : 'What would you like to do next? Choose the next lesson or practice again.',
        context: options.guide?.state.active ? 'First fight • Tutorial' : 'Practice • Tutorial' });
      if (state.advanceReady && !choiceShown && !options.guide?.state.active && !demonstration.active && !view.expanded) { choiceShown = true;options.clear();view.focusCompletion(); }
    },
    close: returnToPlay,
    dispose() { rewardGeneration++;demo.close();celebration.dispose();view.dispose();open.remove();style.remove(); },
  };
}
