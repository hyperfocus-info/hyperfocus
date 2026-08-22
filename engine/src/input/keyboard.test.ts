import { expect, test } from "bun:test";
import { createKeyboardActions } from "./keyboard.ts";

function createTarget() {
  const handlers = new Map<string, Set<(event: any) => void>>();
  return {
    addEventListener(type: string, handler: (event: any) => void) {
      if (!handlers.has(type)) handlers.set(type, new Set());
      handlers.get(type)?.add(handler);
    },
    removeEventListener(type: string, handler: (event: any) => void) {
      handlers.get(type)?.delete(handler);
    },
    dispatch(type: string, event: any) {
      for (const handler of handlers.get(type) ?? []) handler(event);
    }
  };
}

test("keyboard actions expose pressed held and released transitions", () => {
  const target = createTarget();
  const keyboard = createKeyboardActions({ Space: "jump" }, target);
  let prevented = 0;
  const event = { code: "Space", preventDefault: () => prevented += 1 };

  target.dispatch("keydown", event);
  expect(keyboard.down("jump")).toBe(true);
  expect(keyboard.held("jump")).toBe(true);
  expect(keyboard.pressed("jump")).toBe(true);
  expect(keyboard.consume("jump")).toBe(true);
  expect(keyboard.consume("jump")).toBe(false);

  target.dispatch("keydown", event);
  expect(keyboard.pressed("jump")).toBe(false);

  target.dispatch("keyup", event);
  expect(keyboard.down("jump")).toBe(false);
  expect(keyboard.released("jump")).toBe(true);
  expect(keyboard.consumeRelease("jump")).toBe(true);
  expect(prevented).toBe(3);
});

test("keyboard update clears one-frame transitions without clearing held state", () => {
  const target = createTarget();
  const keyboard = createKeyboardActions({ KeyA: "left" }, target);

  target.dispatch("keydown", { code: "KeyA", preventDefault() {} });
  keyboard.update();
  expect(keyboard.down("left")).toBe(true);
  expect(keyboard.pressed("left")).toBe(false);

  target.dispatch("keyup", { code: "KeyA", preventDefault() {} });
  keyboard.update();
  expect(keyboard.released("left")).toBe(false);
});

test("keyboard reset clears held and one-frame state after focus loss", () => {
  const target = createTarget();
  const keyboard = createKeyboardActions({ KeyA: "left", Space: "jump" }, target);

  target.dispatch("keydown", { code: "KeyA", preventDefault() {} });
  target.dispatch("keydown", { code: "Space", preventDefault() {} });
  expect(keyboard.down("left")).toBe(true);
  expect(keyboard.pressed("jump")).toBe(true);

  target.dispatch("blur", {});
  expect(keyboard.down("left")).toBe(false);
  expect(keyboard.held("jump")).toBe(false);
  expect(keyboard.pressed("jump")).toBe(false);
  expect(keyboard.released("left")).toBe(false);
});

test("keyboard blur reset can be disabled", () => {
  const target = createTarget();
  const keyboard = createKeyboardActions({ KeyA: "left" }, target, { resetOnBlur: false });

  target.dispatch("keydown", { code: "KeyA", preventDefault() {} });
  target.dispatch("blur", {});
  expect(keyboard.down("left")).toBe(true);

  keyboard.reset();
  expect(keyboard.down("left")).toBe(false);
});

test("keyboard actions are Node-safe and ignore inherited binding names", () => {
  expect(() => createKeyboardActions({ Space: "jump" })).toThrow("event target");
  const target = createTarget();
  const keyboard = createKeyboardActions(JSON.parse('{"KeyA":"__proto__"}'), target);

  target.dispatch("keydown", { code: "toString", preventDefault() {} });
  expect(keyboard.down("toString")).toBe(false);
  target.dispatch("keydown", { code: "KeyA", preventDefault() {} });
  expect(keyboard.down("__proto__")).toBe(true);
});

test("an action remains held until all of its bound keys are released", () => {
  const target = createTarget();
  const keyboard = createKeyboardActions({ KeyA: "left", ArrowLeft: "left" }, target);
  const event = (code: string) => ({ code, preventDefault() {} });

  target.dispatch("keydown", event("KeyA"));
  target.dispatch("keydown", event("ArrowLeft"));
  keyboard.update();
  target.dispatch("keyup", event("KeyA"));
  expect(keyboard.down("left")).toBe(true);
  expect(keyboard.released("left")).toBe(false);
  target.dispatch("keyup", event("ArrowLeft"));
  expect(keyboard.down("left")).toBe(false);
  expect(keyboard.released("left")).toBe(true);
});

test("disposing keyboard actions releases held state", () => {
  const target = createTarget();
  const keyboard = createKeyboardActions({ KeyA: "left" }, target);
  target.dispatch("keydown", { code: "KeyA", preventDefault() {} });
  expect(keyboard.down("left")).toBe(true);

  keyboard.dispose();
  expect(keyboard.down("left")).toBe(false);
  expect(keyboard.down("left")).toBe(false);
});

test("keyboard lifecycle reconciliation clears keys even when blur is skipped", () => {
  const target = createTarget();
  const lifecycle = Object.assign(createTarget(), { hidden: false, visibilityState: "visible" });
  const keyboard = createKeyboardActions({ KeyA: "left" }, target, { lifecycleTarget: lifecycle });
  target.dispatch("keydown", { code: "KeyA", preventDefault() {} });
  lifecycle.hidden = true;
  lifecycle.visibilityState = "hidden";
  lifecycle.dispatch("visibilitychange", {});
  expect(keyboard.down("left")).toBe(false);

  target.dispatch("keydown", { code: "KeyA", preventDefault() {} });
  target.dispatch("pagehide", {});
  expect(keyboard.down("left")).toBe(false);
  keyboard.dispose();
});
