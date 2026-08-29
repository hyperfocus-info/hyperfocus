import { expect, test } from "bun:test";
import { beginMmoAbility, chargeMmoAbility, clearMmoAbility, hasMmoAbilityEvent, markMmoAbilityEvent, markMmoAbilityEventMs, mmoAbilityEventMs, mmoAbilityReady, tickMmoAbility, tickMmoAbilityInterval, type MmoAbilityRuntime } from "./ability.ts";

function runtime(): MmoAbilityRuntime {
  return {
    activeAbility: "",
    activeSlot: "",
    activeMs: 0,
    activeDurationMs: 0,
    chargeMs: 0,
    abilityVectorX: 0,
    abilityVectorY: 0,
    abilityTickMs: 0,
    abilityHits: ""
  };
}

test("ability runtime begins ticks charges and clears", () => {
  const actor = runtime();
  beginMmoAbility(actor, "Q", "stone", 1000, { x: 0, y: 2 });

  expect(actor.activeAbility).toBe("stone");
  expect(actor.activeSlot).toBe("Q");
  expect(actor.abilityVectorY).toBe(1);
  expect(tickMmoAbility(actor, 0.25)).toEqual({ previousMs: 0, activeMs: 250, elapsedMs: 250 });
  expect(mmoAbilityReady(actor, 200)).toBe(true);
  expect(chargeMmoAbility(actor, 100)).toBe(100);

  clearMmoAbility(actor);
  expect(actor.activeAbility).toBe("");
});

test("ability runtime tracks interval ticks and transient events", () => {
  const actor = runtime();
  let ticks = 0;
  tickMmoAbilityInterval(actor, 0.31, 100, () => {
    ticks += 1;
  });
  expect(ticks).toBe(3);
  expect(actor.abilityTickMs).toBe(10);

  markMmoAbilityEvent(actor, "released");
  markMmoAbilityEventMs(actor, "hit", "target", 120);
  expect(hasMmoAbilityEvent(actor, "released")).toBe(true);
  expect(mmoAbilityEventMs(actor, "hit", "target")).toBe(120);
});

test("ability runtime normalizes hostile direction vectors without losing huge finite directions", () => {
  const actor = runtime();
  beginMmoAbility(actor, "Q", "safe", 10, { x: Number.NaN, y: 1 });
  expect({ x: actor.abilityVectorX, y: actor.abilityVectorY }).toEqual({ x: 1, y: 0 });

  beginMmoAbility(actor, "Q", "huge", 10, { x: Number.MAX_VALUE, y: Number.MAX_VALUE });
  expect(actor.abilityVectorX).toBeFinite();
  expect(actor.abilityVectorY).toBeFinite();
  expect(Math.hypot(actor.abilityVectorX, actor.abilityVectorY)).toBeCloseTo(1);
});

test("ability interval tick count is bounded by call-entry state despite callback mutation", () => {
  const actor = runtime();
  actor.abilityTickMs = 300;
  let callbacks = 0;

  expect(tickMmoAbilityInterval(actor, 0, 100, () => {
    callbacks += 1;
    actor.abilityTickMs = Number.POSITIVE_INFINITY;
  })).toBe(3);
  expect(callbacks).toBe(3);
  expect(actor.abilityTickMs).toBe(0);

  actor.abilityTickMs = 300;
  expect(tickMmoAbilityInterval(actor, 0, 100, () => undefined, 1.9)).toBe(1);
  expect(actor.abilityTickMs).toBe(200);
  expect(tickMmoAbilityInterval(actor, 0, 100, () => undefined, Number.NaN)).toBe(0);
  expect(actor.abilityTickMs).toBe(200);
});

test("ability event bounds reject non-finite and non-positive limits transactionally", () => {
  const actor = runtime();
  actor.abilityHits = "existing";

  expect(() => markMmoAbilityEvent(actor, "next", Number.NaN)).toThrow("positive safe integer");
  expect(actor.abilityHits).toBe("existing");
  expect(() => markMmoAbilityEventMs(actor, "hit", "target", 10, 0)).toThrow("positive safe integer");
  expect(actor.abilityHits).toBe("existing");
});
