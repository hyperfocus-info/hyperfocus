type ReplayPanelState = { active: boolean; playing: boolean; seeking: boolean; findingDamage?: boolean; notice?: string; frame: number; length: number; controlledSeat?: 0 | 1; error?: string; hasRecent?: boolean };

/** Generated-game session UI; recordings never modify authored project data. */
export function createCombatReplayPanel(options: {
  canvas: HTMLCanvasElement; onOpen(file: File): Promise<void>; onToggle(): void; onSeek(frame: number): void;
  onTakeOver(seat: 0 | 1): void; onLeave(): void; onInteract(): void; onReviewRecent?(): void; onSaveRecent?(): void | Promise<void>;
  onNextDamage?(): void; onWatchExample?(): void;
}) {
  const host = document.createElement('section');host.className = 'hf-replay';
  host.innerHTML = `<button type="button" data-replay-open>Watch a replay</button>
    <dialog aria-labelledby="hf-replay-title"><h2 id="hf-replay-title">Watch a replay</h2>
      <p>Watch the decisive exchange, rewind, then take over either fighter to try your answer. Friends can open a shared replay link in this game version.</p><button type="button" data-replay-example>Watch an expert AI fight</button><p>No recording yet? Watch a live example, or open a replay a friend shared with you.</p>
      <p>New recordings keep fighter names and wardrobe choices. Uploaded pictures are not included.</p>
      <div data-replay-recent-section hidden><button type="button" data-replay-recent>Review last online match</button><button type="button" data-replay-recent-save>Save last replay</button><p>Keep or share this match before closing the page. The replay file downloads to your device; it is not a video.</p></div>
      <label>Replay file<input type="file" accept=".pb,.json,application/vnd.hyperfocus.replay+protobuf,application/json" data-replay-file></label>
      <p data-replay-open-status role="status" aria-live="polite">Choose a replay file, up to 20 MiB.</p>
      <button type="button" data-replay-close>Close</button>
    </dialog>
    <div class="hf-replay-live" hidden aria-label="Replay controls">
      <div class="hf-replay-row"><strong data-replay-position></strong><button type="button" data-replay-toggle>Play</button><button type="button" data-replay-leave>Return to local play</button></div>
      <form class="hf-replay-row" data-replay-seek><label>Frame<input type="number" min="0" step="1" required data-replay-frame></label><button type="submit">Go</button>
        <button type="button" data-replay-take="0">Take over fighter 1</button><button type="button" data-replay-take="1">Take over fighter 2</button></form>
      <div class="hf-replay-row"><button type="button" data-replay-next-damage>Next damage</button><button type="button" data-replay-rewind>Rewind 1s</button></div>
      <p>Next damage finds health loss, including blocked chip. Rewind returns to the recording. During takeover, your opponent follows the recording, then stays idle when it ends.</p>
      <p data-replay-pad hidden>During takeover, press your controller Pause button to open replay controls.</p>
      <p data-replay-status role="status" aria-live="polite"></p>
    </div>`;
  const style = document.createElement('style');style.textContent = `
    .hf-replay{position:absolute;inset:0;pointer-events:none;z-index:13;font:14px/1.5 system-ui;color:#e9f1f5}.hf-replay [hidden]{display:none!important}
    .hf-replay button,.hf-replay dialog,.hf-replay-live{pointer-events:auto}.hf-replay button{font:inherit;cursor:pointer;border:1px solid #526676;border-radius:4px;background:#14232f;color:#e9f1f5;padding:8px 12px;min-height:44px}
    .hf-replay button:hover{background:#263f4e}.hf-replay button:focus-visible,.hf-replay input:focus-visible{outline:2px solid #6adbdc;outline-offset:3px}.hf-replay button:disabled,.hf-replay input:disabled{opacity:.5;cursor:default}
    .hf-replay [data-replay-open]{position:absolute;left:5%;top:calc(6% + 86px)}
    .hf-replay dialog{box-sizing:border-box;width:min(520px,calc(100vw - 24px));max-height:calc(100dvh - 32px);overflow:auto;border:1px solid #526676;border-radius:8px;padding:24px;background:#101c28;color:#e9f1f5}.hf-replay dialog::backdrop{background:#040a12cc}.hf-replay h2{font-size:26px;line-height:1.15;margin:0}
    .hf-replay p{color:#bdccd7;margin:6px 0;font-size:12px}.hf-replay label{display:flex;align-items:center;gap:8px}.hf-replay dialog label{align-items:stretch;flex-direction:column;margin:16px 0}
    .hf-replay input{box-sizing:border-box;min-width:0;max-width:100%;min-height:44px;padding:8px;border:1px solid #526676;border-radius:4px;background:#080f17;color:#e9f1f5;font:inherit}.hf-replay input[type=number]{width:90px}
    .hf-replay-live{position:absolute;left:16px;right:16px;bottom:16px;background:#0c162bf5;border:1px solid #344653;border-radius:4px;padding:8px;max-height:45dvh;overflow:auto}.hf-replay-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.hf-replay-row+form{margin-top:8px}.hf-replay strong{font-variant-numeric:tabular-nums}
    @media(max-width:600px){.hf-replay [data-replay-open]{font-size:12px;padding:8px 10px}.hf-replay dialog{padding:18px}.hf-replay-live{left:8px;right:8px;bottom:8px}.hf-replay-live button{font-size:12px;padding:6px 8px}.hf-replay-row{gap:6px}}
  `;
  host.append(style);options.canvas.parentElement?.append(host);
  const find = <T extends Element>(selector: string) => host.querySelector<T>(selector)!;
  const dialog = find<HTMLDialogElement>('dialog'), open = find<HTMLButtonElement>('[data-replay-open]');
  const file = find<HTMLInputElement>('[data-replay-file]'), loadStatus = find<HTMLElement>('[data-replay-open-status]');
  const example = find<HTMLButtonElement>('[data-replay-example]');example.hidden = !options.onWatchExample;example.onclick = () => { dismiss();options.onWatchExample?.(); };
  const recent = find<HTMLButtonElement>('[data-replay-recent]');
  const saveRecent = find<HTMLButtonElement>('[data-replay-recent-save]');
  const live = find<HTMLElement>('.hf-replay-live'), field = find<HTMLInputElement>('[data-replay-frame]');
  const toggle = find<HTMLButtonElement>('[data-replay-toggle]'), status = find<HTMLElement>('[data-replay-status]');
  let state: ReplayPanelState = { active: false, playing: false, seeking: false, frame: 0, length: 0 }, loading = false, disposed = false, inlineError = '', generation = 0, seekDirty = false;
  field.addEventListener('input', () => { seekDirty = true; });
  const cancelLoad = () => { generation++;if (loading) options.onLeave();loading = false;file.disabled = false;recent.disabled = false;saveRecent.disabled = false;loadStatus.textContent = 'Choose a replay file, up to 20 MiB.'; };
  const dismiss = () => { cancelLoad();dialog.close();(state.active ? options.canvas : open).focus({ preventScroll: true }); };
  open.addEventListener('click', () => { options.onInteract();dialog.showModal();(state.hasRecent && options.onReviewRecent ? recent : options.onWatchExample ? example : file).focus(); });
  find<HTMLButtonElement>('[data-replay-close]').addEventListener('click', dismiss);
  function reviewRecent() {
    if (disposed || loading || !options.onReviewRecent) return;
    options.onInteract();generation++;
    try { options.onReviewRecent();seekDirty = false;inlineError = '';loadStatus.textContent = '';dialog.close();options.canvas.focus({ preventScroll: true }); }
    catch (cause) { if (!dialog.open) dialog.showModal();loadStatus.textContent = cause instanceof Error ? cause.message : 'Could not open the last online match.';recent.focus(); }
  }
  recent.addEventListener('click', () => { if (state.hasRecent) reviewRecent(); });
  let saving = false;
  saveRecent.addEventListener('click', () => {
    if (saving || loading || !state.hasRecent || !options.onSaveRecent) return;
    options.onInteract();
    try {
      const result = options.onSaveRecent();
      if (result) {
        saving = true;saveRecent.disabled = true;loadStatus.textContent = 'Preparing replay download…';
        void result.then(() => { if (!disposed) loadStatus.textContent = 'Replay download started.'; }, cause => {
          if (!disposed) loadStatus.textContent = cause instanceof Error ? cause.message : 'Could not save the last replay. Try again.';
        }).finally(() => { saving = false;if (!disposed) saveRecent.disabled = loading; });
      } else loadStatus.textContent = 'Replay download started.';
    }
    catch (cause) { loadStatus.textContent = cause instanceof Error ? cause.message : 'Could not save the last replay. Try again.'; }
  });
  dialog.addEventListener('cancel', () => { cancelLoad();queueMicrotask(() => { if (!disposed && !dialog.open) (state.active ? options.canvas : open).focus({ preventScroll: true }); }); });
  file.addEventListener('change', () => {
    const selected = file.files?.[0];if (!selected || loading) return;
    options.onInteract();file.value = '';
    if (selected.size > 20971520) { loadStatus.textContent = 'Choose a replay smaller than 20 MiB.';return; }
    const attempt = ++generation;loading = true;file.disabled = true;recent.disabled = true;saveRecent.disabled = true;loadStatus.textContent = 'Opening replay…';
    void options.onOpen(selected).then(() => { if (!disposed && attempt === generation) { seekDirty = false;inlineError = '';dialog.close();options.canvas.focus({ preventScroll: true }); } }, cause => {
      if (!disposed && attempt === generation) loadStatus.textContent = cause instanceof Error ? cause.message : 'Could not open this replay.';
    }).finally(() => { if (!disposed && attempt === generation) { loading = false;file.disabled = false;recent.disabled = false;saveRecent.disabled = false; } });
  });
  toggle.addEventListener('click', () => { options.onInteract();options.onToggle(); });
  find<HTMLButtonElement>('[data-replay-next-damage]').addEventListener('click', () => { if (!state.active || state.seeking || state.findingDamage || state.controlledSeat !== undefined || state.frame >= state.length) return;options.onInteract();options.onNextDamage?.(); });
  find<HTMLButtonElement>('[data-replay-rewind]').addEventListener('click', () => { if (!state.active || state.seeking || state.findingDamage) return;options.onInteract();options.onSeek(Math.max(0, state.frame - 60));seekDirty = false;inlineError = ''; });
  find<HTMLFormElement>('[data-replay-seek]').addEventListener('submit', event => {
    event.preventDefault();if (state.seeking) return;
    const frame = field.value === '' ? NaN : Number(field.value);
    if (!Number.isSafeInteger(frame) || frame < 0 || frame > state.length) { inlineError = `Choose a whole frame from 0 to ${state.length}.`;status.textContent = inlineError;return; }
    options.onInteract();options.onSeek(frame);seekDirty = false;inlineError = '';status.textContent = '';
  });
  for (const button of host.querySelectorAll<HTMLButtonElement>('[data-replay-take]')) button.addEventListener('click', () => {
    const seat = Number(button.dataset.replayTake);
    if (seat !== 0 && seat !== 1) throw new Error('Replay takeover requires a fighter seat.');
    options.onInteract();options.onTakeOver(seat);options.canvas.focus({ preventScroll: true });
  });
  find<HTMLButtonElement>('[data-replay-leave]').addEventListener('click', () => { options.onInteract();options.onLeave();options.canvas.focus({ preventScroll: true }); });
  return {
    reviewRecent,
    get focused() { return dialog.open || host.contains(document.activeElement); },
    render(next: ReplayPanelState, menu: boolean, controller = false) {
      if (!next.active || !state.active && next.active) { seekDirty = false;inlineError = ''; }
      state = next;open.hidden = next.active || !menu;live.hidden = !next.active;
      find<HTMLElement>('[data-replay-pad]').hidden = !controller;
      find<HTMLElement>('[data-replay-recent-section]').hidden = !next.hasRecent || !options.onReviewRecent && !options.onSaveRecent;recent.hidden = !options.onReviewRecent;recent.disabled = loading;saveRecent.hidden = !options.onSaveRecent;saveRecent.disabled = loading || saving;
      toggle.textContent = next.playing ? 'Pause' : 'Play';field.max = String(next.length);
      if (!seekDirty && document.activeElement !== field) field.value = String(next.frame);
      find<HTMLElement>('[data-replay-position]').textContent = next.controlledSeat === undefined ? `Replay · ${next.frame} / ${next.length}` : `Controlling fighter ${next.controlledSeat + 1}`;
      for (const control of live.querySelectorAll<HTMLButtonElement | HTMLInputElement>('button,input')) control.disabled = (next.seeking || !!next.findingDamage) && !control.hasAttribute('data-replay-leave');
      find<HTMLButtonElement>('[data-replay-next-damage]').disabled = !options.onNextDamage || next.seeking || !!next.findingDamage || next.controlledSeat !== undefined || next.frame >= next.length;
      status.textContent = next.error || (next.findingDamage ? 'Finding the next health loss…' : next.seeking ? 'Seeking…' : inlineError || next.notice || '');
    },
    dispose() { disposed = true;generation++;dialog.close();host.remove(); },
  };
}
