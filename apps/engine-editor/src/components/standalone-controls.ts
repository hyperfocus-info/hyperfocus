import type { StandaloneSceneContent } from "./standalone-scene-content.ts";

/** Accessible delivery controls derived from the same action names as keyboard input. */
export function createStandaloneControls(options: {
  canvas: HTMLCanvasElement;
  mappings: readonly { action: string; bindings: readonly string[] }[];
  contextualActions?: readonly string[];
  onInteract: () => void;
  onPaused?: (paused: boolean) => void;
  onPauseRequested?: () => void;
  preferences?: { volume: number; reducedMotion: boolean; onVolume: (value: number) => void; onReducedMotion: (value: boolean) => void; hideVolume?: boolean };
}) {
  const host = document.createElement("section");
  host.className = "playable-controls";
  host.setAttribute("aria-label", "Game controls");
  const actions = document.createElement("div");
  actions.className = "playable-actions";
  const held = new Map<number, string>(), taps = new Set<string>();
  const buttons = new Map<string, HTMLButtonElement>();
  const contextualActions = new Set(options.contextualActions);
  let paused = false;
  const pause = document.createElement("button");
  pause.type = "button"; pause.textContent = "Pause"; pause.setAttribute("aria-pressed", "false");
  const presentPause = (value: boolean) => {
    const label = value ? "Resume" : "Pause", pressed = String(value);
    if (pause.textContent !== label) pause.textContent = label;
    if (pause.getAttribute("aria-pressed") !== pressed) pause.setAttribute("aria-pressed", pressed);
  };
  const togglePause = () => {
    paused = !paused; held.clear(); taps.clear();presentPause(paused);
    options.onPaused?.(paused);
    options.onInteract();
  };
  pause.addEventListener('click', () => {
    if (options.onPauseRequested) { options.onPauseRequested();options.onInteract(); }
    else togglePause();
  });
  host.append(pause, actions);
  if (options.preferences) {
    const preferences = options.preferences;
    const settings = document.createElement("details"), heading = document.createElement("summary");
    heading.textContent = preferences.hideVolume ? 'Motion' : "Sound and motion";
    const volumeLabel = document.createElement("label"), volume = document.createElement("input"), readout = document.createElement("output");
    volumeLabel.textContent = "Volume ";
    volume.type = "range"; volume.min = "0"; volume.max = "100"; volume.step = "1";
    volume.value = String(Math.round(preferences.volume * 100));
    readout.value = `${volume.value}%`;
    volume.addEventListener("input", () => { preferences.onVolume(Number(volume.value) / 100); readout.value = `${volume.value}%`; options.onInteract(); });
    volumeLabel.append(volume, readout);
    const motionLabel = document.createElement("label"), motion = document.createElement("input");
    motion.type = "checkbox"; motion.checked = preferences.reducedMotion;
    motion.addEventListener("change", () => preferences.onReducedMotion(motion.checked));
    motionLabel.append(motion, " Reduce motion and blur");
    settings.append(heading);if (!preferences.hideVolume) settings.append(volumeLabel, document.createElement("br"));settings.append(motionLabel);
    host.append(settings);
  }
  for (const action of new Set(options.mappings.map((mapping) => mapping.action))) {
    const button = document.createElement("button");
    button.type = "button"; button.textContent = action.replace(/[-_]/g, " ");
    button.dataset.playableAction = action;
    buttons.set(action, button);
    button.title = options.mappings.find((mapping) => mapping.action === action)?.bindings.join(" / ") ?? action;
    button.addEventListener("pointerdown", (event) => {
      if (paused || button.hidden || button.disabled) return;
      held.set(event.pointerId, action); taps.add(action);
      button.setPointerCapture(event.pointerId); options.onInteract();
    });
    button.addEventListener("pointerup", (event) => held.delete(event.pointerId));
    button.addEventListener("pointercancel", (event) => held.delete(event.pointerId));
    button.addEventListener("lostpointercapture", (event) => held.delete(event.pointerId));
    button.addEventListener("click", (event) => { if (!paused && !button.hidden && !button.disabled && event.detail === 0) { taps.add(action); options.onInteract(); } });
    actions.append(button);
  }
  const details = document.createElement("details"), summary = document.createElement("summary"), text = document.createElement("div");
  summary.textContent = "Readable scene text";
  details.className = "playable-transcript";
  text.className = "playable-scene-text"; text.setAttribute("aria-live", "polite");
  details.append(summary, text); details.hidden = true; host.append(details);
  const narrow = window.matchMedia("(max-width: 600px)");
  const lines = new Map<string, HTMLParagraphElement>();
  let sceneContent: readonly StandaloneSceneContent[] = [];
  const arrange = (parent: HTMLElement, nodes: readonly HTMLElement[]) => {
    for (let index = 0; index < nodes.length; index++) if (parent.children[index] !== nodes[index]) parent.insertBefore(nodes[index]!, parent.children[index] ?? null);
    while (parent.children.length > nodes.length) parent.lastElementChild?.remove();
  };
  const renderSceneContent = () => {
    const nodes: HTMLElement[] = [], used = new Set<string>(), liveIds = new Set<string>();
    for (const entry of sceneContent) {
      const button = entry.action && buttons.get(entry.action);
      if (button) {
        if (narrow.matches && !button.hidden && !used.has(entry.action!)) { nodes.push(button); used.add(entry.action!); }
        continue;
      }
      let line = lines.get(entry.id);
      if (!line) { line = document.createElement("p"); line.className = "playable-scene-line"; lines.set(entry.id, line); }
      if (line.textContent !== entry.text) line.textContent = entry.text;
      nodes.push(line); liveIds.add(entry.id);
    }
    // Move existing buttons, preserving focus and held input through ordinary text updates.
    arrange(text, nodes);
    arrange(actions, [...buttons].filter(([action]) => !used.has(action)).map(([, button]) => button));
    for (const id of lines.keys()) if (!liveIds.has(id)) lines.delete(id);
    details.hidden = nodes.length === 0;
  };
  const layoutTranscript = () => {
    details.open = narrow.matches;
    if (narrow.matches) host.prepend(details); else host.append(details);
    renderSceneContent();
  };
  layoutTranscript(); narrow.addEventListener("change", layoutTranscript);
  options.canvas.parentElement?.append(host);
  const clear = () => { held.clear(); taps.clear(); };
  window.addEventListener("blur", clear);
  const visibility = () => { if (document.hidden) clear(); };
  document.addEventListener("visibilitychange", visibility);
  window.addEventListener("pagehide", () => { clear(); host.remove(); narrow.removeEventListener("change", layoutTranscript); window.removeEventListener("blur", clear); document.removeEventListener("visibilitychange", visibility); }, { once: true });
  return {
    get paused() { return paused; },
    togglePause,
    presentPause,
    readActions() { return new Set([...held.values(), ...taps]); },
    acknowledgeActions() { taps.clear(); },
    setActionAvailability(value: { ownedActions: ReadonlySet<string>; availableActions: ReadonlySet<string> }) {
      for (const action of value.ownedActions) contextualActions.add(action);
      for (const [action, button] of buttons) {
        const unavailable = contextualActions.has(action) && !value.availableActions.has(action);
        button.hidden = unavailable; button.disabled = unavailable;
        if (unavailable) { taps.delete(action); for (const [pointer, heldAction] of held) if (heldAction === action) held.delete(pointer); }
      }
    },
    setActionLabels(labels: ReadonlyMap<string, string>) {
      for (const [action, button] of buttons) {
        const label = labels.get(action)?.replace(/\s+/g, " ").trim().slice(0, 160) || action.replace(/[-_]/g, " ");
        if (button.textContent !== label) button.textContent = label;
      }
    },
    setSceneContent(value: readonly StandaloneSceneContent[]) {
      if (value.length === sceneContent.length && value.every((entry, index) => entry.id === sceneContent[index]?.id && entry.text === sceneContent[index]?.text && entry.action === sceneContent[index]?.action)) return;
      sceneContent = value; renderSceneContent();
    },
    setSceneText(value: string) { sceneContent = value ? [{ id: "scene", text: value }] : []; renderSceneContent(); },
  };
}
