import type { CombatProject3D, GameplaySnapshot3D } from '@hyperfocus/engine/project/runtime-3d';
import { createPracticeInputHistory, practiceFrameLines } from './practice-model.ts';
import { drawPracticeVolumes } from './practice-volumes.ts';
import { createPracticeGuidance } from './practice-guidance.ts';
import { createInteractionPrompt } from '../interaction-prompt.ts';
import { createPracticeEvidence } from './practice-evidence.ts';
import { createPracticeComboEvidence } from './practice-combo.ts';
import { practicePhysicalLines } from './practice-physical.ts';
import { placeCombatGuidance, type FighterScreenBounds } from '../bar-layout.ts';
import { projectFighterBar } from '../fighter-bars.ts';
import { createPracticeWorkspace } from './practice-workspace';
import { practiceInputLabel } from './practice-readout';

/** Optional, session-local lab instruments. They never supply combat inputs or change simulation. */
export function createPracticeDiagnostics(options: { canvas: HTMLCanvasElement; definition: CombatProject3D; mappings?: readonly { action: string; bindings: readonly string[] }[]; setup?(): void; reset?(): void; opened?(): void; closed?(): void }) {
  const { canvas, definition } = options;
  const interaction = createInteractionPrompt({ ...options, mappings: options.mappings ?? [] });
  const workspace = createPracticeWorkspace(options), root = workspace.element;
  const timing = workspace.controls.get('timing')!, history = workspace.controls.get('history')!, volumes = workspace.controls.get('volumes')!;
  const combined = workspace.controls.get('timing-inputs')!, combinedContent = workspace.content.get('timing-inputs')!;
  const attempts = workspace.controls.get('attempts')!, causality = workspace.controls.get('causality')!, combos = workspace.controls.get('combos')!;
  const combo = workspace.content.get('combos')!, physical = workspace.content.get('causality')!, attempt = workspace.content.get('attempts')!;
  const frames = workspace.content.get('timing')!, inputs = workspace.content.get('history')!;
  const style = document.createElement('style');style.textContent = '.hf-practice-volumes{position:absolute;z-index:5;pointer-events:none;background:transparent!important}.hf-practice-volumes[hidden]{display:none!important}';root.append(style);
  let lastAttempt = '', lastPreset = '';const guidance = createPracticeGuidance();
  const wire = document.createElement('canvas');wire.className = 'hf-practice-volumes';wire.setAttribute('aria-hidden', 'true');wire.hidden = true;
  const lesson = document.createElement('p');lesson.className = 'hf-practice-lesson';lesson.hidden = true;lesson.setAttribute('role', 'status');lesson.setAttribute('aria-label', 'Practice lesson');
  style.textContent += '.hf-practice-lesson{position:absolute;z-index:5;top:54px;left:50%;transform:translateX(-50%);margin:0;padding:8px 12px;max-width:min(360px,calc(100% - 24px));width:max-content;color:#eaf4ff;background:#0c162bed;border:1px solid #ffffff40;border-radius:5px;font:12px/1.5 system-ui;pointer-events:none;white-space:pre-line;box-sizing:border-box;overflow-wrap:anywhere}.hf-practice-lesson[hidden]{display:none}@media(max-width:600px){.hf-practice-lesson{top:98px}}';
  canvas.parentElement?.append(wire, lesson);
  const ctx = wire.getContext('2d'), log = createPracticeInputHistory(), evidence = createPracticeEvidence(), comboEvidence = createPracticeComboEvidence();let active = false;
  root.addEventListener('keydown', event => { if (event.code === 'Space' || event.code === 'Enter' || event.code.startsWith('Arrow')) event.stopPropagation(); });
  history.addEventListener('change', () => log.clear());
  combined.addEventListener('change', () => log.clear());
  combos.addEventListener('change', () => comboEvidence.clear());
  return {
    get focused() { return workspace.focused; },
    get captureEvidence() { return active && (history.checked || combined.checked || combos.checked); },
    record(snapshot: GameplaySnapshot3D, actions: Iterable<string>) {
      // Observe every committed step: a rendered frame can skip the final recovery tick.
      if (combos.checked) comboEvidence.observe({ snapshot, definition });
      if (!history.checked && !combined.checked) return;
      const id = definition.fighters.find(fighter => fighter.control === 'player')?.entityId;
      const direction = snapshot.combat?.influence?.find(row => row.id === id)?.direction ?? snapshot.combat?.state.fighters.find(fighter => fighter.id === id)?.influenceDirection;
      log.record({ active: snapshot.combat?.match?.phase === 'practice', frame: snapshot.combat?.state.frame ?? 0, tick: snapshot.tick,
        actions, direction, hitstop: (snapshot.combat?.hitstop.remaining ?? 0) > 0 });
    },
    render(input: { snapshot: GameplaySnapshot3D; matrix: ArrayLike<number>; hidden?: boolean; routine?: boolean; paused?: boolean; coaching?: boolean; suspended?: boolean; controller?: boolean; interactionHidden?: boolean; localFighterId?: string; interactionTargets?: Record<string, string> }) {
      interaction.render({ ...input, hidden: input.interactionHidden ?? input.hidden });
      const practice = input.snapshot.combat?.match?.phase === 'practice';
      if (!practice && active) { log.clear();evidence.clear();comboEvidence.clear();lastAttempt = '';timing.checked = history.checked = combined.checked = volumes.checked = attempts.checked = combos.checked = false; }
      active = practice;root.hidden = !practice || input.hidden === true;
      if (!practice) causality.checked = false;
      const learning = input.snapshot.combat?.practice;
      if (learning?.preset !== lastPreset) { lastAttempt = '';lastPreset = learning?.preset ?? ''; }
      const observed = practice && !input.suspended ? evidence.observe(input.snapshot, definition) : { di: '', exchange: '' };
      const comboText = combos.checked && !input.suspended ? comboEvidence.observe({ snapshot: input.snapshot, definition, localFighterId: input.localFighterId }) : '';
      const instruction = guidance.text({ snapshot: input.snapshot, definition, mappings: options.mappings ?? [], controller: input.controller }) + (learning?.preset === 'di-drill' ? `\n${observed.di}` : '');
      workspace.render({ active: practice && !input.hidden, preset: learning?.preset ?? 'neutral', label: input.routine ? 'Opponent routine' : undefined, cue: input.routine ? 'Looping from saved spacing. Training setup to edit or stop.' : learning?.preset === 'neutral' ? instruction.split('\n')[0]!.replace('Start here: ', '') : '', paused: input.paused, coaching: input.coaching });
      lesson.hidden = root.hidden || !!input.paused || !!input.routine || !instruction;
      if (!lesson.hidden && lesson.textContent !== instruction) lesson.textContent = instruction;
      if (!lesson.hidden) {
        const canvasRect = canvas.getBoundingClientRect(), panel = lesson.getBoundingClientRect();
        const width = canvas.clientWidth, height = canvas.clientHeight;
        const bodies: FighterScreenBounds[] = [];
        for (const fighter of input.snapshot.combat?.state.fighters ?? []) {
          const p = fighter.position;
          const points = [[p.x - 1, p.y - 1.2, p.z], [p.x + 1, p.y - 1.2, p.z], [p.x - 1, p.y + 1.4, p.z], [p.x + 1, p.y + 1.4, p.z]]
            .map(position => projectFighterBar({ position, matrix: input.matrix, width, height })).filter(point => point !== undefined);
          if (points.length) bodies.push({ left: Math.min(...points.map(point => point.x)) - 8, right: Math.max(...points.map(point => point.x)) + 8,
            top: Math.min(...points.map(point => point.y)) - 8, bottom: Math.max(...points.map(point => point.y)) + 8 });
        }
        const current = { left: panel.left - canvasRect.left, right: panel.right - canvasRect.left, top: panel.top - canvasRect.top, bottom: panel.bottom - canvasRect.top };
        const placed = placeCombatGuidance({ current, bodies, width, height });
        if (placed !== current) Object.assign(lesson.style, { left: `${canvas.offsetLeft + placed.left}px`, top: `${canvas.offsetTop + placed.top}px`, bottom: 'auto', transform: 'none' });
      }
      wire.hidden = root.hidden || !!input.paused || !!input.suspended || !volumes.checked;
      if (root.hidden || input.suspended) return;
      combo.hidden = !combos.checked;combo.textContent = comboText || 'Try a fresh attack press. Input timing, stamina limits and completed misses appear here.';
      physical.hidden = !causality.checked;
      if (causality.checked) {
        physical.textContent = practicePhysicalLines({ snapshot: input.snapshot, definition }).join('\n') || 'No physical interactions yet.';
      }
      const playerId = definition.fighters.find(fighter => fighter.control === 'player')?.entityId;
      const sample = input.snapshot.combat?.defenseFeedback.find(feedback => feedback.id === playerId)?.lastAttempt;
      if (sample) {
        const offset = sample.impactFrame === undefined ? undefined : sample.inputFrame - sample.impactFrame;
        lastAttempt = `${sample.kind === 'parry' ? 'Parry' : 'Tech'}: ${sample.timing === 'success' ? 'on time' : sample.timing}\nPress F${sample.inputFrame}${sample.impactFrame === undefined ? ' · no valid impact' : ` → impact F${sample.impactFrame}\n${offset === 0 ? 'Same frame' : `${Math.abs(offset!)}f ${offset! < 0 ? 'before' : 'after'} impact`}`}`;
      }
      attempt.hidden = !attempts.checked;attempt.textContent = lastAttempt || 'Try a parry or tech. The last result stays here after reset.';
      frames.hidden = !timing.checked;inputs.hidden = !history.checked;
      frames.textContent = `F${input.snapshot.combat?.state.frame ?? 0}${input.snapshot.combat?.hitstop.remaining ? ` · Hitstop ${input.snapshot.combat.hitstop.remaining}f` : ''}\n${practiceFrameLines({ snapshot: input.snapshot, definition }).join('\n')}\n${observed.exchange}`;
      inputs.textContent = log.entries().map(entry => `F${entry.frame}${entry.hitstop ? ' [hitstop]' : ''}: ${practiceInputLabel({ input: entry.input, mappings: options.mappings ?? [], controller: input.controller })}`).join('\n') || 'Press a control to record it.';
      combinedContent.hidden = !combined.checked;
      if (combined.checked) combinedContent.textContent = `${frames.textContent}\nRecent inputs\n${inputs.textContent.split('\n').slice(0, 8).join('\n')}`;
      workspace.updatePreview();
      if (!wire.hidden && ctx) {
        const width = Math.max(1, canvas.clientWidth), height = Math.max(1, canvas.clientHeight);
        if (wire.width !== width || wire.height !== height) { wire.width = width;wire.height = height; }
        Object.assign(wire.style, { left: `${canvas.offsetLeft}px`, top: `${canvas.offsetTop}px`, width: `${width}px`, height: `${height}px` });
        ctx.clearRect(0, 0, width, height);drawPracticeVolumes({ context: ctx, matrix: input.matrix, width, height, snapshot: input.snapshot, definition });
      }
    },
    dispose() { interaction.dispose();workspace.dispose();wire.remove();lesson.remove();log.clear(); },
  };
}
