/** Explicit CPU endpoints. They never stand in for a browser present or photons. */
export function createRenderProvenance(options: { now(): number; sampledAtMs: number; appliedAtMs?: number; row: Record<string, number | string> }) {
  let started: number | undefined, submitted: number | undefined;
  return {
    begin() {
      if (started !== undefined) throw Error('Render already started');
      started = options.now();Object.assign(options.row, { renderStartedAtMs: started, inputToRenderStartMs: started - options.sampledAtMs,
        ...(options.appliedAtMs === undefined ? {} : { appliedInputToRenderStartMs: started - options.appliedAtMs }) });
    },
    submitted() {
      if (started === undefined || submitted !== undefined) throw Error('Render submission endpoint out of order');
      submitted = options.now();if (submitted < started) throw Error('Render clock moved backward');
      const timing = { renderSubmittedAtMs: submitted, inputToSubmitMs: submitted - options.sampledAtMs,
        ...(options.appliedAtMs === undefined ? {} : { appliedInputToSubmitMs: submitted - options.appliedAtMs }) };
      Object.assign(options.row, timing, { observation: 'cpu-main-visual-submit', presentationObservation: 'unavailable', renderWorkMs: submitted - started });
      return timing;
    },
    finish() {
      if (submitted === undefined) throw Error('Main update completed without submission');
      const finished = options.now();if (finished < submitted) throw Error('Main update clock moved backward');
      options.row.mainUpdateEndedAtMs = finished;
    },
  };
}
