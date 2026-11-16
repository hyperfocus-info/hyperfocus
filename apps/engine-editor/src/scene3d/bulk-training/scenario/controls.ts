import { createGameSelect } from '@hyperfocus/ui/game-menu';
import type { BulkStatus, createBulkPool } from '../pool.ts';
import type { ScenarioProgress } from './simulation.ts';
import { investigationSituations, replaySituations, situationLessonKey, uncertainLessonSituation, type ReplaySituation } from './selection.ts';
import { scenarioSummary } from './summary.ts';
import { investigationFinding, investigationReport } from './findings.ts';

export function createScenarioControls(options: { tools: HTMLDetailsElement; actions: HTMLElement;
  enqueue: ReturnType<typeof createBulkPool>['enqueueScenario'];
  record(progress: ScenarioProgress, input: ReplaySituation['input']): { applied: boolean; effectiveSamples: number; completeWindows: number; effect?: { probes: { maxProbabilityChange: number }[] } } }) {
  const button = (label: string) => { const node = document.createElement('button');node.type = 'button';node.textContent = label;return node; };
  const open = button('Replay a situation'), run = button('Queue paired replays'), cancel = button('Cancel queued replays');
  open.dataset.scenarioOpen = '';run.dataset.scenarioRun = '';cancel.disabled = true;
  const section = document.createElement('details'), heading = document.createElement('summary'), description = document.createElement('small');
  heading.textContent = 'Investigate a situation';description.textContent = 'Workers share fights and investigations. Uncertain lessons queue every legal option against varied opponent responses while training continues. You can also queue a situation below.';
  const select = createGameSelect({ element: document.createElement('button'), ariaLabel: 'Observed situation to replay' });
  const output = document.createElement('pre');output.className = 'training-log training-lessons';output.dataset.scenarioResults = '';output.tabIndex = 0;output.setAttribute('aria-label', 'Scenario replay evidence');output.style.maxHeight = '200px';
  const nav = document.createElement('nav');nav.append(run, cancel);section.append(heading, description, select.element, nav, output);options.tools.append(section);options.actions.append(open);
  type Checkpoint = { situation: ReplaySituation; progress?: ScenarioProgress; lessonUpdate?: ReturnType<typeof options.record> };
  type Report = { checkpoints: Checkpoint[]; canceled?: boolean; error?: string };
  const reports: Report[] = [], pending = new Map<Checkpoint, { cancel(): void; report: Report }>();
  let situations: ReplaySituation[] = [], observed: ReplaySituation[] = [], currentKey = '', value: BulkStatus | undefined, runId: number | undefined, revision = -1;
  const investigated = new Set<string>();
  const contextKey = (row: ReplaySituation) => JSON.stringify([row.input.opponentKeys[row.seat], row.context]);
  function show() {
    const report = reports.at(-1);if (!report) return;
    output.textContent = report.checkpoints.map((row, index) => {
      const lesson = row.lessonUpdate, change = Math.max(0, ...(lesson?.effect?.probes.map(probe => probe.maxProbabilityChange) ?? []));
      return `Fight seed ${row.situation.seed} (${index + 1}/${report.checkpoints.length})\n${row.progress ? scenarioSummary(row.progress) : 'Queued for a worker.'}${lesson ? `\n\nLesson update: ${lesson.completeWindows} response windows${change ? `; action probabilities changed up to ${(change * 100).toFixed(2)} percentage points` : ''}.` : ''}`;
    }).concat(report.error ? [`Investigation failed: ${report.error}`] : [], report.canceled ? ['Investigation canceled.'] : []).join('\n\n');
  }
  function trim() {
    const active = new Set([...pending.values()].map(task => task.report));
    const evidence = reports.filter(report => !active.has(report) && report.checkpoints.some(row => row.progress?.status === 'complete'));
    const other = reports.filter(report => !active.has(report) && !evidence.includes(report));
    for (const rows of [evidence, other]) for (const report of rows.slice(0, Math.max(0, rows.length - 4))) reports.splice(reports.indexOf(report), 1);
  }
  function stop() {
    const tasks = [...pending.values()];pending.clear();
    for (const task of tasks) { task.report.canceled = true;task.cancel(); }
    cancel.disabled = true;trim();
  }
  function start(situation: ReplaySituation, automatic: boolean) {
    let capacity = 128 - pending.size;
    const counts = new Map<string, number>();
    for (const row of pending.keys()) { const key = contextKey(row.situation);counts.set(key, (counts.get(key) ?? 0) + 1); }
    const rows = investigationSituations(value?.contextual, situation, observed).filter(row => {
      const key = contextKey(row), count = counts.get(key) ?? 0;
      if (capacity <= 0 || count >= 3 || [...pending.keys()].some(checkpoint => checkpoint.situation.key === row.key)
        || automatic && investigated.has(situationLessonKey(row))) return false;
      counts.set(key, count + 1);capacity--;return true;
    });
    if (!rows.length) return;
    for (const row of rows) investigated.add(situationLessonKey(row));
    const report: Report = { checkpoints: rows.map(situation => ({ situation })) };reports.push(report);
    const entries = report.checkpoints.map(checkpoint => ({ checkpoint, entry: { cancel() {}, report } }));
    for (const { checkpoint, entry } of entries) pending.set(checkpoint, entry);
    for (const { checkpoint, entry } of entries) {
      if (pending.get(checkpoint) !== entry) continue;
      try {
        entry.cancel = options.enqueue({ situation: checkpoint.situation, changed(progress) {
          if (pending.get(checkpoint) !== entry) return;
          checkpoint.progress = progress;
          if (progress.status === 'complete') {
            pending.delete(checkpoint);
            try { checkpoint.lessonUpdate = options.record(progress, checkpoint.situation.input); }
            catch (error) { report.error = String(error); }
            trim();
          }
          cancel.disabled = !pending.size;show();
        }, failed(message) {
          if (pending.get(checkpoint) !== entry) return;
          pending.delete(checkpoint);report.error = message;cancel.disabled = !pending.size;trim();show();
        } });
      } catch (error) { pending.delete(checkpoint);report.error = String(error); }
    }
    trim();cancel.disabled = !pending.size;show();
  }
  function update(status: BulkStatus) {
    value = status;
    const identity = status.runId ?? status.runSeed;
    if (identity !== runId) { stop();investigated.clear();runId = identity;revision = -1; }
    if (status.state === 'stopped' || status.state === 'error') stop();
    if ((status.contextual?.revision ?? -1) !== revision) {
      revision = status.contextual?.revision ?? -1;observed = replaySituations(status.contextual, 64);
      const retained = new Set([...observed.map(situationLessonKey), ...[...pending.keys()].map(row => situationLessonKey(row.situation))]);
      for (const key of investigated) if (!retained.has(key)) investigated.delete(key);
    }
    const next = observed.slice(0, 6), key = next.map(row => row.key).join('|');
    if (key !== currentKey) {
      currentKey = key;situations = next;
      select.setOptions(next.map(row => ({ value: row.key, label: row.label })));
    }
    const selected = situations.find(row => row.key === select.value);
    run.disabled = !selected || pending.size >= 128 || !['running', 'paused'].includes(status.state) || !status.contextual || !!status.benchmark
      || [...pending.keys()].filter(row => contextKey(row.situation) === contextKey(selected)).length >= 3
      || [...pending.keys()].some(row => row.situation.key === selected.key);
    select.disabled = !situations.length;open.disabled = !situations.length;
    if (!reports.length) output.textContent = situations.length ? 'Choose a situation to add to the worker queue. Paused training keeps queued work until Resume.' : 'Finish a training set to retain a situation.';
    if (status.state === 'running' && status.contextual && !status.benchmark && pending.size < 128) {
      let situation: ReplaySituation | undefined;
      const counts = new Map<string, number>();
      for (const row of pending.keys()) { const key = contextKey(row.situation);counts.set(key, (counts.get(key) ?? 0) + 1); }
      const eligible = observed.filter(row => (counts.get(contextKey(row)) ?? 0) < 3);
      while (pending.size < 128 && (situation = uncertainLessonSituation(status.contextual, investigated, eligible))) {
        start(situation, true);
        // A queued context owns up to three fight seeds; later fights still update its ordinary model.
        for (let index = eligible.length - 1; index >= 0; index--) if (contextKey(eligible[index]!) === contextKey(situation)) eligible.splice(index, 1);
      }
    }
  }
  open.onclick = () => { options.tools.open = true;section.open = true;select.element.focus(); };
  select.element.onchange = () => { if (value) update(value); };
  run.onclick = () => { const situation = situations.find(row => row.key === select.value);if (situation && !run.disabled) start(situation, false); };
  cancel.onclick = () => { stop();show(); };
  return { update, get status() {
    if (!pending.size) return undefined;
    const current = pending.keys().next().value!;
    return { progress: current.progress, checkpoints: pending.size };
  }, finding() { return investigationFinding(reports.flatMap(row => row.checkpoints.flatMap(checkpoint => checkpoint.progress ? [checkpoint.progress] : []))); },
    report() { return investigationReport(reports.flatMap(row => row.checkpoints.flatMap(checkpoint => checkpoint.progress ? [checkpoint.progress] : []))); },
    snapshot: () => structuredClone(reports), dispose() { stop();select.dispose();section.remove();open.remove(); } };
}
