import { overlayOwnsEscape } from "./overlay-stack";
import { afterEach, describe, expect, test } from "bun:test";
import { isTopFocusOverlay, isTopOverlay, registerOverlay } from "./overlay-stack";

afterEach(() => document.body.replaceChildren());

test("descriptive overlays keep Escape priority without taking focus ownership from dialogs", () => {
  const closed: string[] = [];
  const dialog = registerOverlay({ id: "focus-dialog", close: () => { closed.push("dialog"); } });
  const tooltip = registerOverlay({ id: "focus-tooltip", focusOwner: false, close: () => { closed.push("tooltip"); tooltip(); } });
  let menu: (() => void) | undefined;
  try {
    expect(isTopOverlay("focus-tooltip")).toBe(true);
    expect(isTopFocusOverlay("focus-dialog")).toBe(true);
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    expect(closed).toEqual(["tooltip"]);
    menu = registerOverlay({ id: "focus-menu", close() {} });
    expect(isTopFocusOverlay("focus-dialog")).toBe(false);
    expect(isTopFocusOverlay("focus-menu")).toBe(true);
  } finally { menu?.(); tooltip(); dialog(); }
});

describe("overlay stack", () => {
  test("Escape closes only the top overlay and can restore its trigger focus", () => {
    const firstTrigger = document.createElement("button");
    const secondTrigger = document.createElement("button");
    document.body.append(firstTrigger, secondTrigger);
    const closed: string[] = [];
    let unregisterFirst: () => void = () => undefined;
    let unregisterSecond: () => void = () => undefined;
    unregisterFirst = registerOverlay({
      id: "first-menu",
      close: () => {
        closed.push("first");
        unregisterFirst();
        firstTrigger.focus();
      },
    });
    unregisterSecond = registerOverlay({
      id: "second-menu",
      close: () => {
        closed.push("second");
        unregisterSecond();
        secondTrigger.focus();
      },
    });

    document.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }));
    expect(closed).toEqual(["second"]);
    expect(document.activeElement).toBe(secondTrigger);
    document.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }));
    expect(closed).toEqual(["second", "first"]);
    expect(document.activeElement).toBe(firstTrigger);
  });
});

test("one Escape cannot cascade into later window dismissal handlers", () => {
  let lower = 0, upper = 0, legacy = 0;
  const removeLower = registerOverlay({ id: "drawer", close: () => { lower++; } });
  const removeUpper = registerOverlay({ id: "confirmation", close: () => { upper++; removeUpper(); } });
  const listener = () => { legacy++; };
  window.addEventListener("keydown", listener);
  try {
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    expect({ upper, lower, legacy }).toEqual({ upper: 1, lower: 0, legacy: 0 });
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", repeat: true, bubbles: true, cancelable: true }));
    expect(lower).toBe(0); expect(legacy).toBe(0);
    removeLower();
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(legacy).toBe(1);
  } finally { removeUpper(); removeLower(); window.removeEventListener("keydown", listener); }
});

test("replaced registrations survive stale cleanup and detached lower layers cannot steal focus", () => {
  const trigger = document.createElement("button"), first = document.createElement("section"), second = document.createElement("section");
  first.tabIndex = second.tabIndex = -1;
  document.body.append(trigger, first, second);
  const stale = registerOverlay({ id: "first", element: first, restoreFocus: trigger, close() {} });
  const replacement = registerOverlay({ id: "first", element: first, restoreFocus: trigger, close() {} });
  stale(); expect(isTopOverlay("first")).toBe(true);
  const top = registerOverlay({ id: "second", element: second, restoreFocus: trigger, close() {} });
  second.focus(); replacement(); expect(document.activeElement).toBe(second);
  top(); expect(document.activeElement).toBe(trigger);
  top(); expect(isTopOverlay("second")).toBe(false);
});

test("native cancel observers on either side of registration can veto dismissal", () => {
  const first = document.createElement("dialog"), second = document.createElement("dialog");
  document.body.append(first, second);
  let lower = 0, upper = 0;
  const veto = (event: Event) => event.preventDefault();
  first.addEventListener("cancel", veto);
  const removeFirst = registerOverlay({ id: "native-first", element: first, close: () => { lower++; } });
  const removeSecond = registerOverlay({ id: "native-second", element: second, close: () => { upper++; } });
  second.addEventListener("cancel", veto);
  try {
    expect(first.dispatchEvent(new Event("cancel", { cancelable: true }))).toBe(false);
    expect(second.dispatchEvent(new Event("cancel", { cancelable: true }))).toBe(false);
    expect({ lower, upper }).toEqual({ lower: 0, upper: 0 });
    second.removeEventListener("cancel", veto);
    expect(second.dispatchEvent(new Event("cancel", { cancelable: true }))).toBe(true);
    expect(upper).toBe(0); // A synthetic cancel has no browser default action.
    second.dispatchEvent(new Event("close"));
    expect(upper).toBe(1);
    expect(isTopOverlay("native-first")).toBe(true);
  } finally { removeSecond(); removeFirst(); }
});

test("focused and delegated editors consume Escape before overlay dismissal", () => {
  const input = document.createElement("input"); document.body.append(input); input.focus();
  let closes = 0, received = 0, legacy = 0;
  const cleanup = registerOverlay({ id: "editor-drawer", close: () => { closes++; } });
  const consume = (event: KeyboardEvent) => { received++; event.preventDefault(); };
  const host = () => { legacy++; };
  window.addEventListener("keydown", host);
  try {
    input.addEventListener("keydown", consume);
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    input.removeEventListener("keydown", consume);
    // Solid's document dispatcher may be installed after the overlay registry.
    document.addEventListener("keydown", consume);
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    expect({ closes, received, legacy }).toEqual({ closes: 0, received: 2, legacy: 0 });
  } finally { cleanup(); input.removeEventListener("keydown", consume); document.removeEventListener("keydown", consume); window.removeEventListener("keydown", host); }
});

test("a target that closes itself cannot expose another layer to the same Escape", () => {
  const input = document.createElement("input"); document.body.append(input);
  let lower = 0, legacy = 0;
  const removeLower = registerOverlay({ id: "outer", close: () => { lower++; } });
  const removeUpper = registerOverlay({ id: "inner", close() {} });
  input.addEventListener("keydown", removeUpper);
  const host = () => { legacy++; }; window.addEventListener("keydown", host);
  try {
    const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }); input.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true); expect({ lower, legacy }).toEqual({ lower: 0, legacy: 0 });
    input.removeEventListener("keydown", removeUpper); input.addEventListener("keydown", removeLower);
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    expect(legacy).toBe(0); // The dispatch guard outlives the final registration.
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    expect(legacy).toBe(1);
  } finally { removeUpper(); removeLower(); window.removeEventListener("keydown", host); }
});

test("an unregistered native dialog above a drawer retains its browser Escape behavior", () => {
  const drawer = document.createElement("section"), dialog = document.createElement("dialog"), input = document.createElement("input");
  dialog.append(input); document.body.append(drawer, dialog); dialog.setAttribute("open", ""); input.focus();
  let closed = false;
  const cleanup = registerOverlay({ id: "background-drawer", element: drawer, close: () => { closed = true; } });
  try {
    const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    input.dispatchEvent(event);
    expect(closed).toBe(false); expect(event.defaultPrevented).toBe(false);
  } finally { cleanup(); }
});

test("a queued native close from a previous open lifetime cannot remove the reopened surface", () => {
  const dialog = document.createElement("dialog"); document.body.append(dialog);
  dialog.setAttribute("open", "");
  const cleanup = registerOverlay({ id: "reopened-native", element: dialog, close() {} });
  try {
    dialog.dispatchEvent(new Event("close"));
    expect(isTopOverlay("reopened-native")).toBe(true);
    dialog.removeAttribute("open"); dialog.dispatchEvent(new Event("close"));
    expect(isTopOverlay("reopened-native")).toBe(false);
  } finally { cleanup(); }
});

test("delegated hosts can defer Escape to the overlay captured before their handler", () => {
 let closed = 0, owned = false;
 const unregister = registerOverlay({ id: "host-escape-regression", close: () => { closed++; } });
 const delegated = (event: KeyboardEvent) => { owned = overlayOwnsEscape(event); };
 document.addEventListener("keydown", delegated, true);
 try {
  document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
  expect(owned).toBe(true);expect(closed).toBe(1);
 } finally { document.removeEventListener("keydown", delegated, true);unregister(); }
});
