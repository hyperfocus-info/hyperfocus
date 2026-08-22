/**
 * Repo-local on-screen control prototype. This module is tested but is not part
 * of the package export map; promote it only with a documented public contract.
 */
export type OnScreenGamepadInput = {
  set(code: string, isDown: boolean): unknown;
  bind(code: string, action: string): unknown;
};

export type GamepadOptions = {
  input: OnScreenGamepadInput;
  buttons?: string[];
  mapping?: Record<string, string>;
  container?: HTMLElement;
  visible?: boolean;
};

const DEFAULT_MAPPING: Record<string, string> = {
  ArrowLeft: "left",
  ArrowRight: "right",
  ArrowUp: "up",
  ArrowDown: "down",
  Space: "jump",
  KeyZ: "action",
  KeyX: "action2"
};

const DEFAULT_BUTTONS = ["jump", "action", "action2"];

const styledDocuments = new WeakSet<Document>();
function injectStyles(doc: Document) {
  if (styledDocuments.has(doc)) return;
  styledDocuments.add(doc);
  const style = doc.createElement("style");
  style.setAttribute("data-onscreen-gamepad", "true");
  style.textContent = `
    .codex-gamepad {
      position: fixed;
      inset: auto 0 0 0;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      gap: 1rem;
      padding: 1rem;
      pointer-events: none;
      z-index: 2147483647;
      touch-action: none;
      user-select: none;
    }
    .codex-gamepad[hidden] { display: none; }
    .codex-gamepad__cluster {
      display: grid;
      gap: 0.5rem;
      pointer-events: auto;
    }
    .codex-gamepad__dpad {
      grid-template-columns: repeat(3, 3rem);
      grid-template-rows: repeat(3, 3rem);
    }
    .codex-gamepad__buttons {
      grid-auto-flow: column;
      grid-auto-columns: 3.5rem;
      align-items: end;
    }
    .codex-gamepad__key {
      border: 1px solid rgba(255,255,255,0.18);
      border-radius: 999px;
      background: rgba(18, 18, 22, 0.72);
      color: #fff;
      font: 600 0.72rem/1 system-ui, sans-serif;
      letter-spacing: 0.03em;
      text-transform: uppercase;
      min-width: 3rem;
      min-height: 3rem;
      display: grid;
      place-items: center;
      -webkit-tap-highlight-color: transparent;
    }
    .codex-gamepad__key:active,
    .codex-gamepad__key.is-down {
      background: rgba(255,255,255,0.18);
      transform: translateY(1px);
    }
    .codex-gamepad__spacer { visibility: hidden; }
  `;
  (doc.head ?? doc.documentElement).appendChild(style);
}

function pressVirtualKey(input: OnScreenGamepadInput, virtualPressCounts: Map<string, number>, code: string) {
  const count = virtualPressCounts.get(code) ?? 0;
  virtualPressCounts.set(code, count + 1);
  if (count === 0) input.set(code, true);
}

function releaseVirtualKey(input: OnScreenGamepadInput, virtualPressCounts: Map<string, number>, code: string) {
  const count = virtualPressCounts.get(code) ?? 0;
  if (count <= 1) {
    virtualPressCounts.delete(code);
    input.set(code, false);
    return;
  }
  virtualPressCounts.set(code, count - 1);
}

function createButton(doc: Document, input: OnScreenGamepadInput, virtualPressCounts: Map<string, number>, label: string, code: string) {
  const button = doc.createElement("button");
  button.type = "button";
  button.className = "codex-gamepad__key";
  button.textContent = label;
  button.dataset.code = code;
  button.dataset.action = code;
  const activePointers = new Set<number>();

  const down = (pointerId: number) => {
    const wasInactive = activePointers.size === 0;
    activePointers.add(pointerId);
    if (wasInactive) pressVirtualKey(input, virtualPressCounts, code);
    button.classList.add("is-down");
  };
  const up = (pointerId: number) => {
    const removed = activePointers.delete(pointerId);
    if (removed && activePointers.size === 0) {
      releaseVirtualKey(input, virtualPressCounts, code);
      button.classList.remove("is-down");
    }
  };

  const releaseAll = () => {
    if (activePointers.size === 0) return;
    activePointers.clear();
    releaseVirtualKey(input, virtualPressCounts, code);
    button.classList.remove("is-down");
  };

  const handlePointerDown = (event: PointerEvent) => {
    event.preventDefault();
    button.setPointerCapture?.(event.pointerId);
    down(event.pointerId);
  };
  const handlePointerUp = (event: PointerEvent) => {
    event.preventDefault();
    up(event.pointerId);
  };
  const handlePointerCancel = (event: PointerEvent) => {
    event.preventDefault();
    up(event.pointerId);
  };
  const handleLostPointerCapture = (event: PointerEvent) => up(event.pointerId);

  button.addEventListener("pointerdown", handlePointerDown);
  button.addEventListener("pointerup", handlePointerUp);
  button.addEventListener("pointercancel", handlePointerCancel);
  button.addEventListener("lostpointercapture", handleLostPointerCapture);

  return {
    button,
    down,
    up,
    releaseAll,
    dispose() {
      releaseAll();
      button.removeEventListener("pointerdown", handlePointerDown);
      button.removeEventListener("pointerup", handlePointerUp);
      button.removeEventListener("pointercancel", handlePointerCancel);
      button.removeEventListener("lostpointercapture", handleLostPointerCapture);
    }
  };
}

export function createOnScreenGamepad(options: GamepadOptions) {
  const input = options.input;
  if (!input || typeof input.set !== "function" || typeof input.bind !== "function") {
    throw new Error("createOnScreenGamepad requires a scoped input target");
  }
  const doc = options.container?.ownerDocument ?? globalThis.document;
  if (!doc) throw new Error("createOnScreenGamepad requires a DOM document or container");
  injectStyles(doc);
  const container = options.container ?? doc.body;
  if (!container) throw new Error("createOnScreenGamepad requires a container or document body");
  const root = doc.createElement("div");
  root.className = "codex-gamepad";
  root.hidden = options.visible === false;

  const controls: ReturnType<typeof createButton>[] = [];
  const virtualPressCounts = new Map<string, number>();
  const mapping = { ...DEFAULT_MAPPING, ...(options.mapping ?? {}) };
  for (const [code, action] of Object.entries(mapping)) input.bind(code, action);

  const dpad = doc.createElement("div");
  dpad.className = "codex-gamepad__cluster codex-gamepad__dpad";
  const dpadLayout = [null, { code: "ArrowUp", label: "Up" }, null, { code: "ArrowLeft", label: "Left" }, { code: "ArrowDown", label: "Down" }, { code: "ArrowRight", label: "Right" }, null, null, null];
  for (const spec of dpadLayout) {
    if (!spec) {
      const spacer = doc.createElement("span");
      spacer.className = "codex-gamepad__key codex-gamepad__spacer";
      dpad.appendChild(spacer);
      continue;
    }
    const control = createButton(doc, input, virtualPressCounts, spec.label, spec.code);
    dpad.appendChild(control.button);
    controls.push(control);
  }

  const buttons = doc.createElement("div");
  buttons.className = "codex-gamepad__cluster codex-gamepad__buttons";
  const labels = options.buttons ?? DEFAULT_BUTTONS;
  const mappings = labels.map((label, index) => {
    const code = index === 0 ? "Space" : index === 1 ? "KeyZ" : `Key${String.fromCharCode(88 + index - 2)}`;
    return { code, label };
  });
  for (const spec of mappings) {
    const control = createButton(doc, input, virtualPressCounts, spec.label, spec.code);
    buttons.appendChild(control.button);
    controls.push(control);
  }

  root.append(dpad, buttons);
  container.appendChild(root);

  function show() {
    root.hidden = false;
  }

  function hide() {
    for (const control of controls) control.releaseAll();
    root.hidden = true;
  }

  function destroy() {
    for (const control of controls) control.dispose();
    root.remove();
  }

  function setButtonMapping(mapping: Record<string, string>) {
    for (const [code, action] of Object.entries(mapping)) input.bind(code, action);
  }

  return { destroy, show, hide, setButtonMapping };
}
