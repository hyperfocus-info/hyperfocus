import { formatForDisplay } from "@tanstack/solid-hotkeys";
import type { AppHotkeyId } from "../../lib/app-hotkeys";

const recordedModifierKeys = new Set(["Control", "Shift", "Alt", "Meta"]);

export function formatRecordedChord(event: KeyboardEvent) {
  const parts: string[] = [];
  if (event.ctrlKey) parts.push("Ctrl");
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey) parts.push("Shift");
  if (event.metaKey) parts.push("Meta");
  if (!recordedModifierKeys.has(event.key)) {
    const key = event.key.length === 1 ? event.key.toUpperCase() : event.key;
    parts.push(key === " " ? "Space" : key);
  }
  return parts.join("+");
}

export function chordsMatch(left: string, right: string) {
  return left.toLowerCase() === right.toLowerCase()
    || formatForDisplay(left).toLowerCase() === formatForDisplay(right).toLowerCase();
}

export function formatHotkeyForDisplay(value: string) {
  return formatForDisplay(value)
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" + ");
}

export function keybindRowElementId(id: AppHotkeyId) {
  return `keybind-${id}`;
}
