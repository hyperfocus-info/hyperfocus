import { createGameTelemetry, type GameFrameSample } from './telemetry';
import type { createGameExperiments } from './experiments';

/** Host-local preferences and diagnostics; never serialized into the authored game. */
export function createGamePerformance(options: { canvas: HTMLCanvasElement; contentId?: string; storageKey?: string; experiments?: ReturnType<typeof createGameExperiments> }) {
  const key = options.storageKey ?? `hf-game-performance:${location.pathname}`;
  const preferences = { vsync: true, telemetry: false };
  let runtimeFingerprint = 'unavailable';
  // Exported games end with their inline runtime. Hash once, off the frame path,
  // so identical project identities can still distinguish different code builds.
  const runtimeScript = [...document.scripts].filter(script => !script.src && (!script.type || script.type === 'text/javascript')).at(-1)?.textContent;
  if (runtimeScript && crypto.subtle) {
    runtimeFingerprint = 'pending';
    void crypto.subtle.digest('SHA-256', new TextEncoder().encode(runtimeScript)).then(bytes => {
      runtimeFingerprint = [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
    }).catch(() => { runtimeFingerprint = 'unavailable'; });
  }
  try {
    const saved = JSON.parse(localStorage.getItem(key) ?? 'null');
    if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
      for (const name of ['vsync', 'telemetry'] as const) if (typeof saved[name] === 'boolean') preferences[name] = saved[name];
    }
  } catch { /* Invalid or unavailable storage uses session defaults. */ }
  const telemetry = createGameTelemetry(), section = document.createElement('section'), overlay = document.createElement('output');
  overlay.className = 'hf-game-fps';overlay.setAttribute('aria-label', 'Game frame rate');overlay.textContent = '0 FPS · waiting for frame';
  const style = document.createElement('style');style.textContent = '.hf-game-fps{position:absolute;left:max(12px,env(safe-area-inset-left));top:max(12px,env(safe-area-inset-top));z-index:7;pointer-events:none;background:#08101de6;color:#f2f4f7;padding:4px 8px;border-radius:4px;font:12px/1.5 monospace;font-variant-numeric:tabular-nums}.hf-game-fps[hidden]{display:none}@media(max-width:500px){.hf-game-fps{left:auto;right:max(12px,env(safe-area-inset-right))}}.tod-settings .hf-performance-actions{display:flex;flex-wrap:wrap;gap:8px}.tod-settings .hf-performance-note{color:#b9c3d1}';
  options.canvas.parentElement?.append(style, overlay);
  const status = document.createElement('p');status.setAttribute('role', 'status');
  function save() { try { localStorage.setItem(key, JSON.stringify(preferences)); } catch { status.textContent = 'Settings apply this session; local storage is unavailable.'; } }
  function toggle(name: keyof typeof preferences, title: string, description: string) {
    const label = document.createElement('label'), input = document.createElement('input'), note = document.createElement('p');
    input.type = 'checkbox';input.checked = preferences[name];input.setAttribute('aria-label', title);
    const noteId = `hf-performance-${name}`;input.setAttribute('aria-describedby', noteId);note.id = noteId;note.className = 'hf-performance-note';note.textContent = description;
    label.append(input, title);section.append(label, note);
    input.onchange = () => { preferences[name] = input.checked;resetWindow();updateObserver();summary.textContent = preferences.telemetry ? 'Recording recent performance.' : 'Telemetry recording is off.';save(); };
  }
  toggle('vsync', 'VSync', 'On follows display refresh. Off submits frames as fast as browser timers allow and uses more power. The browser may still synchronize presentation.');
  const fpsNote = document.createElement('p');fpsNote.className = 'hf-performance-note';fpsNote.textContent = 'FPS is always visible. It counts fresh game submissions, not display scanout.';section.append(fpsNote);
  toggle('telemetry', 'Record performance telemetry', 'Keeps the latest 1,800 frames and 64 incidents on this device. Nothing is uploaded. Download a report after a slowdown.');
  const summary = document.createElement('p'), actions = document.createElement('div');actions.className = 'hf-performance-actions';
  const download = document.createElement('button'), clear = document.createElement('button');
  download.type = clear.type = 'button';download.textContent = 'Download performance report';clear.textContent = 'Clear telemetry';
  actions.append(download, clear);section.append(summary, actions, status);
  if (options.experiments) section.append(options.experiments.section);
  let windowFrames = 0, windowIntervals = 0, lastDisplay = 0, lastSample: number | undefined;
  let observer: PerformanceObserver | undefined;
  const longTasks: Array<{ startTime: number; duration: number }> = [];
  function resetWindow() { windowFrames = windowIntervals = lastDisplay = 0;lastSample = undefined;overlay.textContent = '0 FPS · waiting for frame'; }
  function updateObserver() {
    observer?.disconnect();observer = undefined;
    if (!preferences.telemetry || typeof PerformanceObserver === 'undefined' || !PerformanceObserver.supportedEntryTypes.includes('longtask')) return;
    observer = new PerformanceObserver(list => { for (const entry of list.getEntries()) { if (longTasks.length === 64) longTasks.shift();longTasks.push({ startTime: entry.startTime, duration: entry.duration }); } });
    observer.observe({ entryTypes: ['longtask'] });
  }
  updateObserver();
  function snapshot() {
    const gl = options.canvas.getContext('webgl2'), extension = gl?.getExtension('WEBGL_debug_renderer_info');
    const history = telemetry.snapshot();
    return { schema: 'hyperfocus-game-performance-v1', recordedAt: new Date().toISOString(), contentId: options.contentId, inlineRuntimeSha256: runtimeFingerprint,
      environment: { userAgent: navigator.userAgent, automation: navigator.webdriver, headless: /Headless/i.test(navigator.userAgent), logicalCpus: navigator.hardwareConcurrency,
        gpu: gl && extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : 'unavailable',
        viewport: { width: innerWidth, height: innerHeight, devicePixelRatio }, buffer: { width: options.canvas.width, height: options.canvas.height },
        visibility: document.visibilityState, power: 'unrecorded', thermal: 'unrecorded', competingWork: 'unrecorded' },
      preferences: { ...preferences, showFps: true }, experiments: options.experiments?.snapshot(), summary: telemetry.summary(), byPhase: Object.fromEntries([...new Set(history.frames.map(frame => frame.phase))].map(phase => [phase, telemetry.summary(phase)])), ...history, longTasks: structuredClone(longTasks),
      notes: ['Frame intervals measure game submissions, not display scanout.', 'Draw totals include main, outline and shadow passes; outline and shadow fields are subsets.', 'CPU and render submission timings are wall time; GPU duration is not measured.', 'Headless timing does not certify interactive performance.', 'Recent fighter poses are diagnostic context, not a deterministic replay.'] };
  }
  download.onclick = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(snapshot(), null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');link.href = url;link.download = 'touch-of-death-performance.json';link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);status.textContent = 'Performance report downloaded.';
  };
  function reset() { telemetry.clear();longTasks.length = 0;resetWindow();summary.textContent = 'Telemetry cleared.'; }
  clear.onclick = reset;
  return {
    section,
    get vsync() { return preferences.vsync; },
    get enabled() { return true; },
    get recording() { return preferences.telemetry; },
    resetWindow,
    present(time: number) { if (lastSample !== undefined && time - lastSample >= 1000) resetWindow(); },
    record(sample: GameFrameSample, context: () => unknown) {
      if (sample.intervalMs <= 0) return;
      lastSample = sample.time;
      if (preferences.telemetry) telemetry.record(sample, context);
      windowFrames++;windowIntervals += sample.intervalMs;
      if (sample.time - lastDisplay < 500) return;
      const fps = windowIntervals ? windowFrames * 1000 / windowIntervals : 0;
      overlay.textContent = `${Math.round(fps)} FPS · ${(windowIntervals / windowFrames).toFixed(1)} ms`;
      summary.textContent = preferences.telemetry ? `${Math.round(fps)} FPS · ${sample.draws} draws · ${sample.steps} simulation steps. Recent history is ready to download.` : 'Telemetry recording is off.';
      lastDisplay = sample.time;windowFrames = windowIntervals = 0;
    },
    snapshot,
    clear: reset,
    dispose() { options.experiments?.dispose();observer?.disconnect();style.remove();overlay.remove();section.remove(); },
  };
}
