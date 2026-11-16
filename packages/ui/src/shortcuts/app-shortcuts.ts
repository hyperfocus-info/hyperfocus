type ShortcutAction = { id: string; key: string; run: () => void; enabled?: () => boolean; allowInInput?: boolean };

function parseKey(key: string) {
  const parts = key.toLowerCase().split("+").map(part => part.trim());
  const value = parts.pop();
  const modifiers = new Set(parts);
  if (!value || parts.some(part => !["mod", "ctrl", "meta", "alt", "shift"].includes(part)) || (modifiers.has("mod") && (modifiers.has("ctrl") || modifiers.has("meta")))) {
    throw new Error(`Invalid app shortcut: ${key}`);
  }
  return { key: value === "space" ? " " : value, mod: modifiers.has("mod"), ctrl: modifiers.has("ctrl"), meta: modifiers.has("meta"), alt: modifiers.has("alt"), shift: modifiers.has("shift") };
}

function isEditable(event: KeyboardEvent) {
  return event.composedPath().some(node => {
    if (!node || !("closest" in node) || typeof node.closest !== "function") return false;
    return Boolean(node.closest('input, textarea, select, [role="textbox"]')) || ("isContentEditable" in node && node.isContentEditable === true);
  });
}

function isNativeEditing(event: KeyboardEvent) {
  if (["Backspace", "Delete", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "Enter", "Tab"].includes(event.key)) return true;
  if (!(event.ctrlKey || event.metaKey || event.altKey) && event.key.length === 1) return true;
  return !event.altKey && (event.ctrlKey || event.metaKey) && ["a", "c", "v", "x", "y", "z"].includes(event.key.toLowerCase());
}

/** Installs only at the host's lifetime boundary; importing this module needs no DOM. */
export function installAppShortcuts(options: { target?: Window; actions: readonly ShortcutAction[] }) {
  const target = options.target ?? (typeof window === "undefined" ? undefined : window);
  const bindings = options.actions.map(action => ({ action, match: parseKey(action.key) }));
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.defaultPrevented || event.isComposing || event.keyCode === 229 || event.repeat) return;
    const editable = isEditable(event);
    if (editable && isNativeEditing(event)) return;
    for (const { action, match } of bindings) {
      if (event.key.toLowerCase() !== match.key || event.shiftKey !== match.shift || event.altKey !== match.alt) continue;
      if (match.mod ? event.metaKey === event.ctrlKey : event.metaKey !== match.meta || event.ctrlKey !== match.ctrl) continue;
      if ((editable && !action.allowInInput) || action.enabled?.() === false) continue;
      event.preventDefault();
      action.run();
      break;
    }
  };
  target?.addEventListener("keydown", onKeyDown);
  return () => target?.removeEventListener("keydown", onKeyDown);
}
